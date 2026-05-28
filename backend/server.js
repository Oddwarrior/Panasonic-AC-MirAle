import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MirAIeClient } from './miraieClient.js';
import { MongoClient, ObjectId } from 'mongodb';
import { encrypt, decrypt } from './cryptoHelper.js';

dotenv.config();

// ─── MongoDB Initialization ────────────────────────────────────────────────
let db = null;
let mongoClient = null;

if (process.env.MONGODB_URI) {
  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(); // Automatically uses 'panasonic_miraie' database from MONGODB_URI
    console.log('[MongoDB] Successfully connected to database.');

    // Proactively build optimal indexing for telemetry queries
    await db.collection('events').createIndex({ userId: 1, deviceId: 1, timestamp: -1 });
    console.log('[MongoDB] Configured telemetry database indexes.');

    // Proactively build optimal indexing for workflows queries
    await db.collection('workflows').createIndex({ userId: 1, deviceId: 1 });
    console.log('[MongoDB] Configured workflow database indexes.');

    // Backfill updatedAt if not present
    const unsetCount = await db.collection('workflows').countDocuments({ updatedAt: { $exists: false } });
    if (unsetCount > 0) {
      console.log(`[MongoDB] Backfilling updatedAt for ${unsetCount} workflows...`);
      const cursor = db.collection('workflows').find({ updatedAt: { $exists: false } });
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const fallbackDate = doc.createdAt || new Date().toISOString();
        await db.collection('workflows').updateOne(
          { _id: doc._id },
          { $set: { updatedAt: fallbackDate } }
        );
      }
      console.log('[MongoDB] Backfilled updatedAt successfully.');
    }
  } catch (error) {
    console.error('[MongoDB] Database connection or indexing failed:', error.message);
  }
} else {
  console.error('[MongoDB] Database connection skipped. MONGODB_URI not found in environment.');
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

    // 3. Save/Update credentials in MongoDB background_users collection
    if (db) {
      try {
        const encrypted = encrypt(password);
        await db.collection('background_users').updateOne(
          { _id: authData.userId },
          {
            $set: {
              username,
              encryptedPassword: encrypted.encryptedData,
              iv: encrypted.iv,
              updatedAt: new Date().toISOString()
            }
          },
          { upsert: true }
        );
        console.log(`[MongoDB] Saved/updated background credentials for user ${authData.userId}`);
      } catch (err) {
        console.error('[MongoDB] Failed to save background credentials:', err.message);
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

            await db.collection('events').insertOne({
              userId: authData.userId,
              deviceId: deviceId,
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
            console.log(`[MongoDB] Logged telemetry event for ${deviceId} (Wattage: ${wattage}W)`);
          } catch (err) {
            console.error('[MongoDB] Failed to log telemetry event:', err.message);
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

// ─── Tariff Geographic Mapping ──────────────────────────────────────────────
const INDIAN_STATES_DB = [
  {
    state: 'Maharashtra',
    rate: 7.50,
    bbox: { minLat: 15.6, maxLat: 22.1, minLon: 72.6, maxLon: 80.9 },
    center: { lat: 19.75, lon: 75.71 }
  },
  {
    state: 'Karnataka',
    rate: 7.00,
    bbox: { minLat: 11.5, maxLat: 18.5, minLon: 74.0, maxLon: 78.6 },
    center: { lat: 15.31, lon: 75.71 }
  },
  {
    state: 'Delhi NCR',
    rate: 4.50,
    bbox: { minLat: 28.2, maxLat: 28.9, minLon: 76.7, maxLon: 77.4 },
    center: { lat: 28.61, lon: 77.20 }
  },
  {
    state: 'West Bengal',
    rate: 7.30,
    bbox: { minLat: 21.5, maxLat: 27.3, minLon: 85.8, maxLon: 89.9 },
    center: { lat: 22.98, lon: 87.85 }
  },
  {
    state: 'Tamil Nadu',
    rate: 6.00,
    bbox: { minLat: 8.0, maxLat: 13.6, minLon: 76.2, maxLon: 80.4 },
    center: { lat: 11.12, lon: 78.65 }
  },
  {
    state: 'Telangana',
    rate: 6.50,
    bbox: { minLat: 15.8, maxLat: 19.9, minLon: 77.2, maxLon: 81.8 },
    center: { lat: 18.11, lon: 79.01 }
  },
  {
    state: 'Gujarat',
    rate: 6.20,
    bbox: { minLat: 20.1, maxLat: 24.7, minLon: 68.1, maxLon: 74.5 },
    center: { lat: 22.25, lon: 71.19 }
  },
  {
    state: 'Uttar Pradesh',
    rate: 6.50,
    bbox: { minLat: 23.8, maxLat: 30.4, minLon: 77.1, maxLon: 84.7 },
    center: { lat: 26.84, lon: 80.74 }
  },
  {
    state: 'Haryana',
    rate: 5.50,
    bbox: { minLat: 27.6, maxLat: 30.6, minLon: 74.4, maxLon: 77.6 },
    center: { lat: 29.05, lon: 76.08 }
  }
];

function mapStateToTariff(stateName) {
  const name = stateName.toLowerCase();
  if (name.includes('maharashtra')) return { state: 'Maharashtra', rate: 7.50 };
  if (name.includes('karnataka')) return { state: 'Karnataka', rate: 7.00 };
  if (name.includes('delhi')) return { state: 'Delhi NCR', rate: 4.50 };
  if (name.includes('west bengal')) return { state: 'West Bengal', rate: 7.30 };
  if (name.includes('tamil nadu')) return { state: 'Tamil Nadu', rate: 6.00 };
  if (name.includes('telangana')) return { state: 'Telangana', rate: 6.50 };
  if (name.includes('gujarat')) return { state: 'Gujarat', rate: 6.20 };
  if (name.includes('uttar pradesh')) return { state: 'Uttar Pradesh', rate: 6.50 };
  if (name.includes('haryana')) return { state: 'Haryana', rate: 5.50 };
  return null;
}

function getFallbackState(lat, lon) {
  // 1. Check bbox matches
  const matches = INDIAN_STATES_DB.filter(s =>
    lat >= s.bbox.minLat && lat <= s.bbox.maxLat &&
    lon >= s.bbox.minLon && lon <= s.bbox.maxLon
  );

  if (matches.length === 1) {
    return matches[0];
  } else if (matches.length > 1) {
    let closest = matches[0];
    let minDist = Infinity;
    for (const match of matches) {
      const dist = Math.pow(match.center.lat - lat, 2) + Math.pow(match.center.lon - lon, 2);
      if (dist < minDist) {
        minDist = dist;
        closest = match;
      }
    }
    return closest;
  }

  // 2. If no bbox matches, pick closest center among all states
  let closest = INDIAN_STATES_DB[0];
  let minDist = Infinity;
  for (const s of INDIAN_STATES_DB) {
    const dist = Math.pow(s.center.lat - lat, 2) + Math.pow(s.center.lon - lon, 2);
    if (dist < minDist) {
      minDist = dist;
      closest = s;
    }
  }

  if (minDist > 100) {
    return null;
  }
  return closest;
}

// ─── GET /api/devices/:deviceId/tariff ─────────────────────────────────────
app.get('/api/devices/:deviceId/tariff', requireAuth, async (req, res) => {
  const { deviceId } = req.params;
  const { session } = req;

  const device = session.devices.find(d => d.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const location = device.details?.location;
  if (!location || !Array.isArray(location) || location.length < 2) {
    console.warn(`[Tariff] Location coordinates not found for device ${deviceId}. Using national default.`);
    return res.json({
      rate: 6.50,
      state: 'National Average',
      city: 'India',
      source: 'default'
    });
  }

  const [lon, lat] = location;
  console.log(`[Tariff] Device coordinates: lat=${lat}, lon=${lon}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: {
        'User-Agent': 'Panasonic-AC-Smart-Dashboard/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        const country = addr.country || '';
        const stateName = addr.state || '';
        const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || 'Unknown City';

        console.log(`[Tariff] Geocoded location: state=${stateName}, city=${city}, country=${country}`);

        const mapped = mapStateToTariff(stateName);
        if (mapped) {
          return res.json({
            rate: mapped.rate,
            state: mapped.state,
            city: city,
            source: 'geocoded'
          });
        } else if (country.toLowerCase() === 'india' || stateName) {
          return res.json({
            rate: 6.50,
            state: stateName || 'National Average',
            city: city,
            source: 'geocoded_default'
          });
        }
      }
    }
  } catch (error) {
    console.warn(`[Tariff] Geocoding API failed or timed out: ${error.message}. Performing fallback.`);
  }

  const fallback = getFallbackState(lat, lon);
  if (fallback) {
    console.log(`[Tariff] Fallback resolved to state: ${fallback.state} with rate ${fallback.rate}`);
    return res.json({
      rate: fallback.rate,
      state: fallback.state,
      city: 'Region',
      source: 'fallback'
    });
  }

  console.log(`[Tariff] Ultimate fallback to National Average.`);
  return res.json({
    rate: 6.50,
    state: 'National Average',
    city: 'India',
    source: 'fallback_default'
  });
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
        device.status.temperature = Math.round(parseFloat(value));
        break;

      case 'mode':
        session.client.setHVACMode(device, value);
        device.status.hvacMode = value;
        // Preset modes eco/boost are only valid in Cool (and Heat). Clear them for dry/fan/auto.
        if (value === 'dry' || value === 'fan') {
          device.status.presetMode = 'none';
          // Converti is a Cool-only feature
          device.status.convertiMode = 0;
        } else if (value === 'auto') {
          // Converti is not supported in Auto mode
          device.status.convertiMode = 0;
          device.status.presetMode = 'none';
        } else {
          // cool / heat: just clear any active preset
          device.status.presetMode = 'none';
        }
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
        // Converti resets all presets in the AC protocol (acem:off, acpm:off)
        device.status.presetMode = 'none';
        break;

      case 'preset':
        session.client.setPresetMode(device, value);
        device.status.presetMode = value;
        // Setting any preset resets Converti to 0 in the AC protocol (cnv: 0)
        device.status.convertiMode = 0;
        if (value === 'eco') device.status.temperature = 26;
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
    return res.status(503).json({ error: 'Database is not initialized.' });
  }

  const { deviceId, days, startDate, endDate } = req.query;
  const { session } = req;

  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  // Security check: Verify the device belongs to the logged-in user's account
  const device = session.devices.find(d => d.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found or access denied.' });
  }

  try {
    const filter = { userId: session.userId, deviceId };

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        const sDate = new Date(startDate);
        sDate.setHours(0, 0, 0, 0);
        filter.timestamp.$gte = sDate.toISOString();
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = eDate.toISOString();
      }
    } else {
      const queryDays = days ? parseInt(days) : 7;
      const minDate = new Date();
      minDate.setDate(minDate.getDate() - queryDays);
      filter.timestamp = { $gte: minDate.toISOString() };
    }

    const docs = await db.collection('events')
      .find(filter)
      .sort({ timestamp: -1 })
      .toArray();

    // Map _id to id to maintain compatibility with front-end expectations
    const sessions = docs.map(doc => ({ id: doc._id, ...doc }));

    return res.json({ sessions });
  } catch (error) {
    console.error('[Server] Analytics fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// ─── GET /api/analytics/energy ──────────────────────────────────────────────
app.get('/api/analytics/energy', requireAuth, async (req, res) => {
  const { deviceId, timeframe = '7d', startDate, endDate } = req.query;
  const { session } = req;

  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  // Security check: Verify the device belongs to the logged-in user's account
  const device = session.devices.find(d => d.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found or access denied.' });
  }

  // Format dates according to timeframe & grain
  let periodType = 'Daily';
  let queries = [];

  const now = new Date();

  // Helper to format Date into DDMMYYYY
  const formatDDMMYYYY = (date) => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}${m}${y}`;
  };

  // Helper to format Date into MMYYYY
  const formatMMYYYY = (date) => {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${m}${y}`;
  };

  if (timeframe === 'custom' || (startDate && endDate)) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate range in days
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 31) {
      periodType = 'Daily';
      // Fetch an extra 1 day before to prevent timezone gaps
      const adjustedStart = new Date(start);
      adjustedStart.setDate(start.getDate() - 1);
      queries = [{ from: formatDDMMYYYY(adjustedStart), to: formatDDMMYYYY(end) }];
    } else {
      periodType = 'Monthly';
      // Start 1 month before to cover timezone gaps
      const adjustedStart = new Date(start);
      adjustedStart.setMonth(start.getMonth() - 1);

      let currentStart = new Date(adjustedStart);
      while (currentStart <= end) {
        let currentEnd = new Date(currentStart);
        currentEnd.setMonth(currentStart.getMonth() + 5); // Max 6 months inclusive (e.g. May to Oct)
        if (currentEnd > end) {
          currentEnd = new Date(end);
        }

        queries.push({
          from: formatMMYYYY(currentStart),
          to: formatMMYYYY(currentEnd)
        });

        currentStart = new Date(currentEnd);
        currentStart.setMonth(currentEnd.getMonth() + 1);
      }
    }
  } else if (timeframe === '24h') {
    // 24h: fetch Daily grain for the last 3 days to cover all timezone overlaps
    periodType = 'Daily';
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(now.getDate() - 2);
    queries = [{ from: formatDDMMYYYY(twoDaysAgo), to: formatDDMMYYYY(now) }];
  } else if (timeframe === '7d') {
    // 7d: fetch Daily grain for the last 9 days to cover timezone boundaries
    periodType = 'Daily';
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(now.getDate() - 8);
    queries = [{ from: formatDDMMYYYY(eightDaysAgo), to: formatDDMMYYYY(now) }];
  } else if (timeframe === '12m') {
    periodType = 'Monthly';

    // Start 12 months ago
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(now.getMonth() - 12);

    let currentStart = new Date(twelveMonthsAgo);
    while (currentStart <= now) {
      let currentEnd = new Date(currentStart);
      currentEnd.setMonth(currentStart.getMonth() + 5); // Max 6 months inclusive
      if (currentEnd > now) {
        currentEnd = new Date(now);
      }

      queries.push({
        from: formatMMYYYY(currentStart),
        to: formatMMYYYY(currentEnd)
      });

      currentStart = new Date(currentEnd);
      currentStart.setMonth(currentEnd.getMonth() + 1);
    }
  } else {
    return res.status(400).json({ error: `Unsupported timeframe: ${timeframe}` });
  }

  try {
    console.log(`[Server] Querying energy consumption using ${queries.length} chunk(s) for timeframe ${timeframe}`);

    const rawConsumptionPromises = queries.map(q =>
      session.client.getEnergyConsumption(deviceId, periodType, q.from, q.to)
        .catch(err => {
          console.error(`[Server] Energy query segment failed from ${q.from} to ${q.to}:`, err.message);
          return [];
        })
    );

    const rawConsumptionResults = await Promise.all(rawConsumptionPromises);
    const rawConsumption = rawConsumptionResults.flat();

    // Map and sanitize the response data
    // Response format: [{"day": "24052026", "power": 1.25}, ...] or [{"month": "052026", "power": 64.3}, ...]
    const consumption = (rawConsumption || []).map(item => {
      const dateKey = periodType === 'Daily' ? item.day : item.month;
      const power = parseFloat(item.power || 0);
      return {
        dateKey,
        power
      };
    });

    return res.json({ periodType, consumption });
  } catch (error) {
    console.error('[Server] Energy analytics error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch actual energy consumption from Panasonic' });
  }
});

// ─── Workflows API Endpoints ────────────────────────────────────────────────
app.get('/api/workflows', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database is not initialized.' });
  const { deviceId } = req.query;
  try {
    const filter = { userId: req.session.userId };
    if (deviceId) {
      filter.deviceId = deviceId;
    }
    const list = await db.collection('workflows').find(filter).toArray();
    return res.json(list);
  } catch (error) {
    console.error('[Server] Failed to fetch workflows:', error);
    return res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

app.post('/api/workflows', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database is not initialized.' });
  const { deviceId, name, isActive, days, timezone, steps } = req.body;
  if (!deviceId || !name || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'deviceId, name, and steps are required' });
  }

  try {
    const newWorkflow = {
      userId: req.session.userId,
      deviceId,
      name,
      isActive: isActive !== false,
      days: days || [0, 1, 2, 3, 4, 5, 6],
      timezone: timezone || 'Asia/Kolkata',
      steps: steps.map(s => ({
        time: s.time, // "HH:MM"
        actions: {
          power: s.actions?.power, // "on" | "off"
          temperature: s.actions?.temperature ? Math.round(parseFloat(s.actions.temperature)) : undefined,
          mode: s.actions?.mode,
          fanMode: s.actions?.fanMode,
          vSwing: s.actions?.vSwing !== undefined ? parseInt(s.actions.vSwing) : undefined,
          hSwing: s.actions?.hSwing !== undefined ? parseInt(s.actions.hSwing) : undefined,
          preset: s.actions?.preset,
          converti: s.actions?.converti !== undefined ? parseInt(s.actions.converti) : undefined
        }
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = await db.collection('workflows').insertOne(newWorkflow);
    return res.status(201).json({ id: result.insertedId, ...newWorkflow });
  } catch (error) {
    console.error('[Server] Failed to create workflow:', error);
    return res.status(500).json({ error: 'Failed to create workflow' });
  }
});

app.put('/api/workflows/:id', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database is not initialized.' });
  const { id } = req.params;
  const { name, isActive, days, timezone, steps } = req.body;

  try {
    const updateDoc = {
      updatedAt: new Date().toISOString()
    };
    if (name !== undefined) updateDoc.name = name;
    if (isActive !== undefined) updateDoc.isActive = isActive;
    if (days !== undefined) updateDoc.days = days;
    if (timezone !== undefined) updateDoc.timezone = timezone;
    if (steps !== undefined) {
      updateDoc.steps = steps.map(s => ({
        time: s.time,
        actions: {
          power: s.actions?.power,
          temperature: s.actions?.temperature ? Math.round(parseFloat(s.actions.temperature)) : undefined,
          mode: s.actions?.mode,
          fanMode: s.actions?.fanMode,
          vSwing: s.actions?.vSwing !== undefined ? parseInt(s.actions.vSwing) : undefined,
          hSwing: s.actions?.hSwing !== undefined ? parseInt(s.actions.hSwing) : undefined,
          preset: s.actions?.preset,
          converti: s.actions?.converti !== undefined ? parseInt(s.actions.converti) : undefined
        }
      }));
    }

    const result = await db.collection('workflows').updateOne(
      { _id: new ObjectId(id), userId: req.session.userId },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    return res.json({ message: 'Workflow updated successfully' });
  } catch (error) {
    console.error('[Server] Failed to update workflow:', error);
    return res.status(500).json({ error: 'Failed to update workflow' });
  }
});

app.delete('/api/workflows/:id', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database is not initialized.' });
  const { id } = req.params;

  try {
    const result = await db.collection('workflows').deleteOne({
      _id: new ObjectId(id),
      userId: req.session.userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    return res.json({ message: 'Workflow deleted successfully' });
  } catch (error) {
    console.error('[Server] Failed to delete workflow:', error);
    return res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

app.post('/api/workflows/:id/trigger', requireAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database is not initialized.' });
  const { id } = req.params;
  const { stepIndex } = req.body;

  try {
    const workflow = await db.collection('workflows').findOne({
      _id: new ObjectId(id),
      userId: req.session.userId
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    if (stepIndex === undefined) {
      return res.status(400).json({ error: 'Please specify a stepIndex to trigger' });
    }

    const step = workflow.steps[stepIndex];
    if (!step) {
      return res.status(400).json({ error: 'Step index out of bounds' });
    }

    await executeWorkflowStep(workflow.userId, workflow.deviceId, step.actions);
    return res.json({ message: `Triggered step ${stepIndex} successfully`, actions: step.actions });
  } catch (error) {
    console.error('[Server] Failed to trigger workflow step:', error);
    return res.status(500).json({ error: 'Failed to trigger workflow step' });
  }
});

// Helper to execute workflow step actions via MQTT
async function executeWorkflowStep(userId, deviceId, actions) {
  const logger = backgroundLoggers.get(userId);
  if (!logger) {
    console.warn(`[Scheduler] Cannot execute step: No active background logger for user ${userId}`);
    return;
  }
  const device = logger.devices.find(d => d.id === deviceId);
  if (!device) {
    console.warn(`[Scheduler] Cannot execute step: Device ${deviceId} not found for user ${userId}`);
    return;
  }

  console.log(`[Scheduler] Executing scheduled actions for ${device.name} (${deviceId}):`, JSON.stringify(actions));

  try {
    // 1. Power mode
    if (actions.power !== undefined && actions.power !== null) {
      const isOn = actions.power === 'on' || actions.power === true;
      logger.client.setPower(device, isOn);
      device.status.powerMode = isOn ? 'on' : 'off';
    }

    // 2. HVAC mode
    if (actions.mode !== undefined && actions.mode !== null) {
      logger.client.setHVACMode(device, actions.mode);
      device.status.hvacMode = actions.mode;
      // Preset modes eco/boost are only valid in Cool/Heat. Clear for dry/fan/auto.
      if (actions.mode === 'dry' || actions.mode === 'fan') {
        device.status.presetMode = 'none';
        device.status.convertiMode = 0; // Converti is Cool-only
      } else if (actions.mode === 'auto') {
        device.status.convertiMode = 0;
        device.status.presetMode = 'none';
      } else {
        device.status.presetMode = 'none'; // cool / heat
      }
    }

    // 3. Temperature
    if (actions.temperature !== undefined && actions.temperature !== null) {
      const targetTemp = Math.round(parseFloat(actions.temperature));
      logger.client.setTemperature(device, targetTemp);
      device.status.temperature = targetTemp;
    }

    // 4. Fan mode
    if (actions.fanMode !== undefined && actions.fanMode !== null) {
      logger.client.setFanMode(device, actions.fanMode);
      device.status.fanMode = actions.fanMode;
    }

    // 5. Vertical Swing
    if (actions.vSwing !== undefined && actions.vSwing !== null) {
      logger.client.setVSwingMode(device, actions.vSwing);
      device.status.vSwingMode = parseInt(actions.vSwing);
    }

    // 6. Horizontal Swing
    if (actions.hSwing !== undefined && actions.hSwing !== null) {
      logger.client.setHSwingMode(device, actions.hSwing);
      device.status.hSwingMode = parseInt(actions.hSwing);
    }

    // 7. Preset mode
    if (actions.preset !== undefined && actions.preset !== null) {
      logger.client.setPresetMode(device, actions.preset);
      device.status.presetMode = actions.preset;
      // Setting any preset resets Converti to 0 in the AC protocol (cnv: 0)
      device.status.convertiMode = 0;
      // Eco preset forces the AC to 26°C internally — keep status in sync
      // Only override if the step does not also set a temperature explicitly
      if (actions.preset === 'eco' && (actions.temperature === undefined || actions.temperature === null)) {
        device.status.temperature = 26;
      }
    }

    // 8. Converti mode
    if (actions.converti !== undefined && actions.converti !== null) {
      logger.client.setConvertiMode(device, parseInt(actions.converti));
      device.status.convertiMode = parseInt(actions.converti);
      // Converti resets all presets in the AC protocol (acem:off, acpm:off)
      device.status.presetMode = 'none';
    }

    // Log this scheduled execution event in DB telemetry
    if (db) {
      try {
        await db.collection('events').insertOne({
          userId: userId,
          deviceId: deviceId,
          timestamp: new Date().toISOString(),
          powerMode: device.status.powerMode,
          temperature: device.status.temperature,
          roomTemperature: device.status.roomTemperature,
          hvacMode: device.status.hvacMode,
          fanMode: device.status.fanMode,
          presetMode: device.status.presetMode,
          wattage: 0,
          rawPayload: { scheduledTrigger: true, actions }
        });
        console.log(`[MongoDB Scheduler] Logged automation telemetry event for device ${deviceId}`);
      } catch (dbErr) {
        console.error('[MongoDB Scheduler] Failed to write event log:', dbErr.message);
      }
    }
  } catch (error) {
    console.error(`[Scheduler] Failed to dispatch workflow actions:`, error.message);
  }
}

// Background Scheduler Loop (runs once every 60 seconds)
setInterval(async () => {
  if (!db) return;

  try {
    const now = new Date();
    // Fetch all active workflows
    const workflows = await db.collection('workflows').find({ isActive: true }).toArray();
    if (workflows.length === 0) return;

    for (const workflow of workflows) {
      const tz = workflow.timezone || 'Asia/Kolkata';

      // 1. Get current hour and minute in workflow's timezone
      const timePartsFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      let formattedTime = '';
      try {
        const parts = timePartsFormatter.formatToParts(now);
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;
        if (hour && minute) {
          formattedTime = `${hour}:${minute}`;
        }
      } catch (err) {
        console.error(`[Scheduler] Timezone conversion failed for ${tz}:`, err.message);
        continue;
      }

      if (!formattedTime) continue;

      // 2. Get current day of week in workflow's timezone (0 = Sunday, 1 = Monday, etc.)
      const dayFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'long'
      });
      let weekdayNum = -1;
      try {
        const weekdayStr = dayFormatter.format(now);
        const weekdayMap = {
          'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
          'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };
        weekdayNum = weekdayMap[weekdayStr];
      } catch (err) {
        console.error(`[Scheduler] Day formatting failed for ${tz}:`, err.message);
        continue;
      }

      if (weekdayNum === -1) continue;

      // Check if workflow is active for today
      if (workflow.days && !workflow.days.includes(weekdayNum)) {
        continue;
      }

      // Check if any step time matches the current time and is not disabled
      const matchingStep = workflow.steps.find(step => step.time === formattedTime && step.isActive !== false);
      if (matchingStep) {
        console.log(`[Scheduler] Workflow '${workflow.name}' matches time '${formattedTime}' on day ${weekdayNum}`);
        await executeWorkflowStep(workflow.userId, workflow.deviceId, matchingStep.actions);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Tick execution failed:', err.message);
  }
}, 60 * 1000);

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

          await db.collection('events').insertOne({
            userId: userId,
            deviceId: deviceId,
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
          console.log(`[MongoDB Background] Logged telemetry event for ${deviceId} (Wattage: ${wattage}W)`);
        } catch (err) {
          console.error('[MongoDB Background] Failed to log telemetry event:', err.message);
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

    // Save to MongoDB so they are registered in DB for future boots too!
    if (db) {
      try {
        const encrypted = encrypt(password);
        await db.collection('background_users').updateOne(
          { _id: authData.userId },
          {
            $set: {
              username,
              encryptedPassword: encrypted.encryptedData,
              iv: encrypted.iv,
              updatedAt: new Date().toISOString()
            }
          },
          { upsert: true }
        );
        console.log(`[Auto-Login] Saved owner credentials to MongoDB.`);
      } catch (err) {
        console.error('[Auto-Login] Failed to save owner credentials to MongoDB:', err.message);
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
    console.warn('[Startup] Database not initialized. Cannot load background loggers.');
    await loginOwnerFromEnv();
    return;
  }

  console.log('[Startup] Loading registered background users from MongoDB...');
  try {
    const users = await db.collection('background_users').find({}).toArray();
    if (users.length === 0) {
      console.log('[Startup] No background users registered in MongoDB.');
      await loginOwnerFromEnv();
      return;
    }

    console.log(`[Startup] Found ${users.length} background user(s) to initialize.`);
    const promises = [];
    users.forEach(doc => {
      const data = doc;
      const userId = doc._id;
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
    console.error('[Startup] Failed to load background users from MongoDB:', error.message);
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
    const users = await db.collection('background_users').find({}).toArray();
    users.forEach(async doc => {
      const data = doc;
      const userId = doc._id;
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
