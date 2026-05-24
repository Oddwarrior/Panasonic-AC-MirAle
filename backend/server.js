import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MirAIeClient } from './miraieClient.js';
import admin from 'firebase-admin';
import { encrypt, decrypt } from './cryptoHelper.js';

dotenv.config();

// ─── Firebase Initialization ────────────────────────────────────────────────
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let db = null;
let serviceAccount = null;

// 1. Try loading from environment variable first (standard for production)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    let rawStr = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    if (!rawStr.startsWith('{')) {
      console.log('[Firebase] Detected Base64 encoded credentials. Decoding...');
      rawStr = Buffer.from(rawStr, 'base64').toString('utf8');
    }
    serviceAccount = JSON.parse(rawStr);
    console.log('[Firebase] Loaded credentials from FIREBASE_SERVICE_ACCOUNT environment variable.');
  } catch (error) {
    console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', error.message);
  }
}

// 2. Fall back to local serviceAccountKey.json (typical for local development)
if (!serviceAccount) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    console.log('[Firebase] Loaded credentials from local serviceAccountKey.json.');
  } catch (error) {
    console.warn('[Firebase] Fallback to serviceAccountKey.json failed:', error.message);
  }
}

// 3. Initialize Firebase Admin SDK if credentials found
if (serviceAccount && Object.keys(serviceAccount).length > 0) {
  try {
    // Some hosting environments escape newlines in environment variables.
    // Replace literal "\\n" with real newlines for the private key to be read correctly.
    if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('[Firebase] Successfully initialized Firestore.');
  } catch (error) {
    console.error('[Firebase] Failed to initialize Firebase Admin SDK:', error.message);
  }
} else {
  console.error('[Firebase] Failed to initialize Firebase. No valid service account credentials found.');
}

const app = express();
const PORT = process.env.PORT || 5005;

// ─── CORS ──────────────────────────────────────────────────────────────────
// Allow requests from any origin (Vercel, localhost, mobile, etc.)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ─── Session & Background Connection Stores ──────────────────────────────────
//
// backgroundLoggers Map:
// Key   : MirAIe userId (string)
// Value : { client: MirAIeClient, devices: [], updatedAt: number }
//
// sessions Map (Active API sessions for frontend):
// Key   : MirAIe accessToken (string)
// Value : { userId: string, createdAt: number, lastActivity: number }
//
const backgroundLoggers = new Map();
const sessions = new Map();

// Purge inactive frontend API sessions (no requests for 24 hours) to avoid unbounded token memory growth
setInterval(() => {
  const now = Date.now();
  const maxIdleTime = 24 * 60 * 60 * 1000; // 24 hours
  for (const [token, apiSession] of sessions.entries()) {
    const idleTime = now - (apiSession.lastActivity || apiSession.createdAt);
    if (idleTime > maxIdleTime) {
      sessions.delete(token);
      console.log(`[Server] Inactive API session purged for token …${token.slice(-8)}`);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

function teardownBackgroundLogger(userId) {
  const logger = backgroundLoggers.get(userId);
  if (!logger) return;

  logger.client.logout(); // Ends MQTT, nulls tokens
  backgroundLoggers.delete(userId);
  console.log(`[Server] Background logger torn down for user ${userId}`);
}

// ─── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated. Please login first.' });
  }

  const apiSession = sessions.get(token);
  apiSession.lastActivity = Date.now(); // Update last activity timestamp on any request

  const logger = backgroundLoggers.get(apiSession.userId);
  if (!logger) {
    // If the background logger is not running (e.g. server restarted and user was not restored, or login expired)
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  // Provide req.session to keep compatibility with existing device & control endpoints
  req.session = logger; 
  req.session.userId = apiSession.userId;
  req.sessionToken = token;
  next();
}

// ─── Polling helper ─────────────────────────────────────────────────────────
function startPolling(session) {
  if (session.pollingId) clearInterval(session.pollingId);
  session.pollingId = null; // We rely entirely on the real-time MQTT stream. No background REST polling.
}

// ─── Ping Endpoint (For Render Keep-Alive) ──────────────────────────────────
app.get('/api/ping', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ─── POST /api/auth/login ───────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // 1. Authenticate with MirAIe Client
    const client = new MirAIeClient();
    const authData = await client.login(username, password);

    // 2. Discover devices & fetch initial status
    const devices = await client.discoverDevices();
    for (const dev of devices) {
      await client.fetchDeviceStatus(dev.id);
    }

    // 3. Save/Update credentials in Firestore background_users collection
    if (db) {
      try {
        const encrypted = encrypt(password);
        await db.collection('background_users').doc(authData.userId).set({
          username,
          encryptedPassword: encrypted.encryptedData,
          iv: encrypted.iv,
          updatedAt: new Date().toISOString()
        });
        console.log(`[Firebase] Saved/updated background credentials for user ${authData.userId}`);
      } catch (err) {
        console.error('[Firebase] Failed to save background credentials:', err.message);
      }
    }

    // 4. Initialize or update the background logger
    // If there's an existing background logger for this user, tear it down first to avoid duplicate connections
    if (backgroundLoggers.has(authData.userId)) {
      console.log(`[Server] Replacing existing background logger for user ${authData.userId}`);
      teardownBackgroundLogger(authData.userId);
    }

    // Wire MQTT live updates
    client.onStatusUpdate = async (deviceId, newStatus, rawPayload = {}) => {
      const logger = backgroundLoggers.get(authData.userId);
      if (!logger) return;
      const dev = logger.devices.find(d => d.id === deviceId);
      if (dev) {
        dev.status = newStatus;
        if (db) {
          try {
            let wattage = 0;
            const wattageKeys = ['pwr', 'pw', 'eng', 'power', 'wattage', 'w', 'watts'];
            for (const key of wattageKeys) {
              if (rawPayload[key] !== undefined) {
                wattage = parseFloat(rawPayload[key]);
                break;
              }
            }
            
            await db.collection('users').doc(authData.userId)
              .collection('devices').doc(deviceId)
              .collection('events').add({
              timestamp: new Date().toISOString(),
              powerMode: newStatus.powerMode,
              temperature: newStatus.temperature,
              roomTemperature: newStatus.roomTemperature,
              hvacMode: newStatus.hvacMode,
              fanMode: newStatus.fanMode,
              presetMode: newStatus.presetMode,
              wattage: wattage,
              rawPayload: rawPayload
            });
            console.log(`[Firebase] Logged telemetry event for ${deviceId} (Wattage: ${wattage}W)`);
          } catch (err) {
            console.error('[Firebase] Failed to log telemetry event:', err.message);
          }
        }
      }
    };

    // Connect MQTT
    client.connectMQTT();

    // Store in backgroundLoggers
    backgroundLoggers.set(authData.userId, {
      client,
      devices,
      updatedAt: Date.now()
    });

    // 5. Create active API session for the frontend
    sessions.set(authData.accessToken, {
      userId: authData.userId,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });

    console.log(`[Server] New active API session created for user ${authData.userId}. Active API sessions: ${sessions.size}, Background loggers: ${backgroundLoggers.size}`);

    return res.json({
      message: 'Authentication successful',
      accessToken: authData.accessToken,
      devices
    });
  } catch (error) {
    console.error('[Server] Login error:', error.message);
    return res.status(401).json({ error: error.message });
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
app.post('/api/auth/logout', requireAuth, (req, res) => {
  sessions.delete(req.sessionToken);
  console.log(`[Server] Active API session logged out for token …${req.sessionToken.slice(-8)}`);
  return res.json({ success: true, message: 'Logged out successfully' });
});

// ─── GET /api/devices ───────────────────────────────────────────────────────
app.get('/api/devices', requireAuth, (req, res) => {
  return res.json(req.session.devices);
});

// ─── GET /api/devices/:deviceId/status ─────────────────────────────────────
app.get('/api/devices/:deviceId/status', requireAuth, async (req, res) => {
  const { deviceId } = req.params;
  const { session } = req;
  const device = session.devices.find(d => d.id === deviceId);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  // Return the cached state maintained by the MQTT real-time stream
  return res.json(device.status);
});

// ─── POST /api/devices/:deviceId/control ───────────────────────────────────
app.post('/api/devices/:deviceId/control', requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const { action, value } = req.body;
  const { session } = req;

  const device = session.devices.find(d => d.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  console.log(`[Server] Control: Device=${device.name}, Action=${action}, Value=${value}`);

  try {
    switch (action) {
      case 'power':
        session.client.setPower(device, value === true || value === 'on');
        device.status.powerMode = (value === true || value === 'on') ? 'on' : 'off';
        break;

      case 'temperature':
        session.client.setTemperature(device, parseFloat(value));
        device.status.temperature = parseFloat(value);
        break;

      case 'mode':
        session.client.setHVACMode(device, value);
        device.status.hvacMode = value;
        device.status.presetMode = 'none';
        break;

      case 'fanMode':
        session.client.setFanMode(device, value);
        device.status.fanMode = value;
        break;

      case 'vSwing':
        session.client.setVSwingMode(device, value);
        device.status.vSwingMode = parseInt(value);
        break;

      case 'hSwing':
        session.client.setHSwingMode(device, value);
        device.status.hSwingMode = parseInt(value);
        break;

      case 'display':
        session.client.setDisplayMode(device, value === true || value === 'on');
        device.status.displayMode = (value === true || value === 'on') ? 'on' : 'off';
        break;

      case 'converti':
        session.client.setConvertiMode(device, value);
        device.status.convertiMode = parseInt(value);
        device.status.presetMode = 'none';
        break;

      case 'preset':
        session.client.setPresetMode(device, value);
        device.status.presetMode = value;
        if (value === 'eco') device.status.temperature = 26.0;
        break;

      default:
        return res.status(400).json({ error: `Unsupported control action: ${action}` });
    }

    return res.json({
      success: true,
      message: `Command '${action}' sent successfully`,
      status: device.status
    });
  } catch (error) {
    console.error('[Server] Command dispatch failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/analytics ─────────────────────────────────────────────────────
app.get('/api/analytics', requireAuth, async (req, res) => {
  if (!db) {
    return res.status(503).json({ error: 'Firebase is not initialized.' });
  }

  const { deviceId, days = 7 } = req.query;
  const { session } = req;
  
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  // Security check: Verify the device belongs to the logged-in user's account
  const device = session.devices.find(d => d.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found or access denied.' });
  }

  try {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - parseInt(days));

    const snapshot = await db.collection('users').doc(session.userId)
      .collection('devices').doc(deviceId)
      .collection('events')
      .where('timestamp', '>=', minDate.toISOString())
      .orderBy('timestamp', 'desc')
      .get();

    const sessions = [];
    snapshot.forEach(doc => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    return res.json({ sessions });
  } catch (error) {
    console.error('[Server] Analytics fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// ─── Background Loggers Initialization ──────────────────────────────────────
async function startBackgroundLogger(userId, username, password) {
  console.log(`[Background] Starting connection for ${username} (${userId})...`);
  const client = new MirAIeClient();
  const authData = await client.login(username, password);
  const devices = await client.discoverDevices();
  for (const dev of devices) {
    await client.fetchDeviceStatus(dev.id);
  }

  // Wire MQTT live updates
  client.onStatusUpdate = async (deviceId, newStatus, rawPayload = {}) => {
    const logger = backgroundLoggers.get(userId);
    if (!logger) return;
    const dev = logger.devices.find(d => d.id === deviceId);
    if (dev) {
      dev.status = newStatus;
      if (db) {
        try {
          let wattage = 0;
          const wattageKeys = ['pwr', 'pw', 'eng', 'power', 'wattage', 'w', 'watts'];
          for (const key of wattageKeys) {
            if (rawPayload[key] !== undefined) {
              wattage = parseFloat(rawPayload[key]);
              break;
            }
          }
          
          await db.collection('users').doc(userId)
            .collection('devices').doc(deviceId)
            .collection('events').add({
            timestamp: new Date().toISOString(),
            powerMode: newStatus.powerMode,
            temperature: newStatus.temperature,
            roomTemperature: newStatus.roomTemperature,
            hvacMode: newStatus.hvacMode,
            fanMode: newStatus.fanMode,
            presetMode: newStatus.presetMode,
            wattage: wattage,
            rawPayload: rawPayload
          });
          console.log(`[Firebase Background] Logged telemetry event for ${deviceId} (Wattage: ${wattage}W)`);
        } catch (err) {
          console.error('[Firebase Background] Failed to log telemetry event:', err.message);
        }
      }
    }
  };

  client.connectMQTT();

  backgroundLoggers.set(userId, {
    client,
    devices,
    updatedAt: Date.now()
  });
  console.log(`[Background] Session started successfully for user ${userId}`);
}

async function loginOwnerFromEnv() {
  const username = process.env.MIRAIE_MOBILE;
  const password = process.env.MIRAIE_PASSWORD;

  if (!username || !password || username === '+91xxxxxxxxxx' || password === 'your_miraie_password') {
    console.log('[Auto-Login] Credentials not configured in .env. Skipping owner background session.');
    return;
  }

  console.log(`[Auto-Login] Attempting background login for owner ${username} from .env...`);
  try {
    const client = new MirAIeClient();
    const authData = await client.login(username, password);

    // Save to Firestore so they are registered in DB for future boots too!
    if (db) {
      try {
        const encrypted = encrypt(password);
        await db.collection('background_users').doc(authData.userId).set({
          username,
          encryptedPassword: encrypted.encryptedData,
          iv: encrypted.iv,
          updatedAt: new Date().toISOString()
        });
        console.log(`[Auto-Login] Saved owner credentials to Firestore.`);
      } catch (err) {
        console.error('[Auto-Login] Failed to save owner credentials to Firestore:', err.message);
      }
    }

    // Now start it as a regular background logger
    await startBackgroundLogger(authData.userId, username, password);
  } catch (err) {
    console.error('[Auto-Login] Owner background login failed:', err.message);
  }
}

async function initializeBackgroundLoggers() {
  if (!db) {
    console.warn('[Startup] Firebase not initialized. Cannot load background loggers.');
    await loginOwnerFromEnv();
    return;
  }

  console.log('[Startup] Loading registered background users from Firestore...');
  try {
    const snapshot = await db.collection('background_users').get();
    if (snapshot.empty) {
      console.log('[Startup] No background users registered in Firestore.');
      await loginOwnerFromEnv();
      return;
    }

    console.log(`[Startup] Found ${snapshot.size} background user(s) to initialize.`);
    const promises = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const userId = doc.id;
      promises.push((async () => {
        try {
          const password = decrypt(data.encryptedPassword, data.iv);
          await startBackgroundLogger(userId, data.username, password);
        } catch (err) {
          console.error(`[Startup] Failed to initialize background logger for user ${userId}:`, err.message);
        }
      })());
    });
    await Promise.all(promises);
    console.log('[Startup] Background loggers initialization complete.');
  } catch (error) {
    console.error('[Startup] Failed to load background users from Firestore:', error.message);
  }
}

async function refreshBackgroundLogger(userId, username, password) {
  const logger = backgroundLoggers.get(userId);
  if (!logger) return;

  console.log(`[Background] Refreshing credentials & connection for ${username} (${userId})...`);
  try {
    const authData = await logger.client.login(username, password);
    logger.client.connectMQTT();
    logger.updatedAt = Date.now();
    console.log(`[Background] Refreshed successfully for user ${userId}`);
  } catch (err) {
    console.error(`[Background] Refresh failed for user ${userId}:`, err.message);
  }
}

// Periodic refresh loop to keep all MQTT connections authenticated and active (every 12 hours)
setInterval(async () => {
  console.log('[Background] Running periodic connection refresh for all background users...');
  if (!db) return;
  try {
    const snapshot = await db.collection('background_users').get();
    snapshot.forEach(async doc => {
      const data = doc.data();
      const userId = doc.id;
      if (backgroundLoggers.has(userId)) {
        try {
          const password = decrypt(data.encryptedPassword, data.iv);
          await refreshBackgroundLogger(userId, data.username, password);
        } catch (err) {
          console.error(`[Background] Failed to refresh user ${userId}:`, err.message);
        }
      }
    });
  } catch (err) {
    console.error('[Background] Failed to load users for periodic refresh:', err.message);
  }
}, 12 * 60 * 60 * 1000); // 12 hours

// ─── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Panasonic MirAIe AC server running on port ${PORT}`);
  console.log('[Server] Session isolation: ON (token-based, per-user)');

  // Run the background database-backed connection bootstrapper
  initializeBackgroundLoggers();

  // Render.com Free Tier Keep-Alive: Ping itself every 12 minutes to prevent spin-down
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (selfUrl) {
    console.log(`[Keep-Alive] Render deployment detected. Setting up self-ping loop on ${selfUrl}`);
    setInterval(async () => {
      try {
        const pingUrl = `${selfUrl.replace(/\/$/, '')}/api/ping`;
        console.log(`[Keep-Alive] Self-pinging to prevent spin-down: ${pingUrl}`);
        const response = await fetch(pingUrl);
        const data = await response.json();
        console.log(`[Keep-Alive] Status: ${response.status} - ${JSON.stringify(data)}`);
      } catch (err) {
        console.error('[Keep-Alive] Self-ping failed:', err.message);
      }
    }, 12 * 60 * 1000); // 12 minutes
  }
});
