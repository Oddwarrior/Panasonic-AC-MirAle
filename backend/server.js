import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MirAIeClient } from './miraieClient.js';

dotenv.config();

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

// ─── Per-user session store ─────────────────────────────────────────────────
//
// Key   : MirAIe accessToken (string) – returned to the frontend on login
//         and sent back as "Authorization: Bearer <token>" on every request.
// Value : { client: MirAIeClient, devices: [], pollingId: NodeJS.Timeout | null }
//
// Each browser/device has its own entry in this Map.
// Logout removes the entry and tears down MQTT + polling for that user only.
//
const sessions = new Map();

// Purge stale sessions every 30 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      teardownSession(token);
    }
  }
}, 10 * 60 * 1000);

function teardownSession(token) {
  const session = sessions.get(token);
  if (!session) return;

  if (session.pollingId) {
    clearInterval(session.pollingId);
  }
  session.client.logout(); // ends MQTT, nulls tokens
  sessions.delete(token);
  console.log(`[Server] Session torn down for token …${token.slice(-8)}`);
}

// ─── Auth middleware ────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated. Please login first.' });
  }

  req.session = sessions.get(token);
  req.sessionToken = token;
  next();
}

// ─── Polling helper ─────────────────────────────────────────────────────────
function startPolling(session) {
  if (session.pollingId) clearInterval(session.pollingId);
  session.pollingId = null; // We rely entirely on the real-time MQTT stream. No background REST polling.
}

// ─── POST /api/auth/login ───────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Create a brand-new client for this login attempt
    const client = new MirAIeClient();
    const authData = await client.login(username, password);

    // Discover devices & fetch initial status
    const devices = await client.discoverDevices();
    for (const dev of devices) {
      await client.fetchDeviceStatus(dev.id);
    }

    // Build the session object
    const session = {
      client,
      devices,
      pollingId: null,
      createdAt: Date.now()
    };

    // Wire MQTT live updates into this session's device list
    client.onStatusUpdate = (deviceId, newStatus) => {
      const dev = session.devices.find(d => d.id === deviceId);
      if (dev) dev.status = newStatus;
    };

    // Connect MQTT and start polling
    client.connectMQTT();
    startPolling(session);

    // Store session keyed by the user's MirAIe accessToken
    sessions.set(authData.accessToken, session);

    console.log(`[Server] New session created for user ${authData.userId}. Active sessions: ${sessions.size}`);

    return res.json({
      message: 'Authentication successful',
      // Return the token to the frontend – it acts as the session key
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
  teardownSession(req.sessionToken);
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

// ─── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Server] Panasonic MirAIe AC server running on port ${PORT}`);
  console.log('[Server] Session isolation: ON (token-based, per-user)');
});
