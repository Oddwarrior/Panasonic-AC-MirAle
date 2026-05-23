import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MirAIeClient } from './miraieClient.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

const client = new MirAIeClient();
let devicesCached = [];
let pollingIntervalId = null;

// Initialize MirAIe and MQTT
async function initializeMirAIe() {
  const username = process.env.MIRAIE_MOBILE;
  const password = process.env.MIRAIE_PASSWORD;

  if (!username || !password) {
    console.warn('[Server] MIRAIE_MOBILE and MIRAIE_PASSWORD are not configured in .env. Auto-login skipped. Please authenticate via the login API.');
    return;
  }

  try {
    console.log('[Server] Starting automatic login...');
    await client.login(username, password);
    
    console.log('[Server] Discovering devices...');
    devicesCached = await client.discoverDevices();
    console.log(`[Server] Discovered ${devicesCached.length} devices.`);

    if (devicesCached.length > 0) {
      console.log('[Server] Fetching initial status for devices...');
      for (const dev of devicesCached) {
        await client.fetchDeviceStatus(dev.id);
      }

      console.log('[Server] Establishing live MQTT connection...');
      client.connectMQTT();

      // Register live updates
      client.onStatusUpdate = (deviceId, newStatus) => {
        console.log(`[Server] Live MQTT update for device ${deviceId}`);
        const dev = devicesCached.find(d => d.id === deviceId);
        if (dev) {
          dev.status = newStatus;
        }
      };

      // Start REST polling loop (fallback / synchronization)
      startPolling();
    }
  } catch (err) {
    console.error('[Server] Initialization failed:', err.message);
  }
}

// REST polling loop (runs every 12 seconds to keep states aligned)
function startPolling() {
  if (pollingIntervalId) clearInterval(pollingIntervalId);

  const intervalMs = 12000; // 12 seconds
  console.log(`[Server] Starting status sync poll (every ${intervalMs / 1000}s)...`);
  
  pollingIntervalId = setInterval(async () => {
    if (!client.accessToken || devicesCached.length === 0) return;
    
    console.log('[Server] Synchronizing device status from MirAIe cloud...');
    for (const dev of devicesCached) {
      try {
        await client.fetchDeviceStatus(dev.id);
      } catch (err) {
        console.error(`[Server] Error syncing device ${dev.id}:`, err.message);
      }
    }
  }, intervalMs);
}

// 1. POST /api/auth/login - Manual login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const authData = await client.login(username, password);
    
    // Auto discover after manual login
    devicesCached = await client.discoverDevices();
    
    for (const dev of devicesCached) {
      await client.fetchDeviceStatus(dev.id);
    }

    client.connectMQTT();
    client.onStatusUpdate = (deviceId, newStatus) => {
      const dev = devicesCached.find(d => d.id === deviceId);
      if (dev) dev.status = newStatus;
    };

    startPolling();

    return res.json({
      message: 'Authentication successful',
      auth: authData,
      devices: devicesCached
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/logout - Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  console.log('[Server] Received logout request');
  
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    console.log('[Server] Polling interval cleared.');
  }
  
  client.logout();
  devicesCached = [];
  
  return res.json({ success: true, message: 'Logged out successfully' });
});

// 2. GET /api/devices - Get list of discovered devices
app.get('/api/devices', (req, res) => {
  if (!client.accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Please login first.' });
  }
  return res.json(devicesCached);
});

// 3. GET /api/devices/:deviceId/status - Get status of specific device
app.get('/api/devices/:deviceId/status', async (req, res) => {
  if (!client.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { deviceId } = req.params;
  const device = devicesCached.find(d => d.id === deviceId);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  // Optionally fetch fresh status immediately from REST
  try {
    const freshStatus = await client.fetchDeviceStatus(deviceId);
    return res.json(freshStatus);
  } catch (error) {
    // Return cached if REST fails
    console.warn('[Server] Direct status fetch failed, returning cached state.');
    return res.json(device.status);
  }
});

// 4. POST /api/devices/:deviceId/control - Send commands to device
app.post('/api/devices/:deviceId/control', (req, res) => {
  if (!client.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { deviceId } = req.params;
  const { action, value } = req.body;

  const device = devicesCached.find(d => d.id === deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  console.log(`[Server] Received control: Device=${device.name}, Action=${action}, Value=${value}`);

  try {
    switch (action) {
      case 'power':
        client.setPower(device, value === true || value === 'on');
        device.status.powerMode = (value === true || value === 'on') ? 'on' : 'off';
        break;

      case 'temperature':
        client.setTemperature(device, parseFloat(value));
        device.status.temperature = parseFloat(value);
        break;

      case 'mode':
        client.setHVACMode(device, value);
        device.status.hvacMode = value;
        // Mode switch resets preset to none
        device.status.presetMode = 'none';
        break;

      case 'fanMode':
        client.setFanMode(device, value);
        device.status.fanMode = value;
        break;

      case 'vSwing':
        client.setVSwingMode(device, value);
        device.status.vSwingMode = parseInt(value);
        break;

      case 'hSwing':
        client.setHSwingMode(device, value);
        device.status.hSwingMode = parseInt(value);
        break;

      case 'display':
        client.setDisplayMode(device, value === true || value === 'on');
        device.status.displayMode = (value === true || value === 'on') ? 'on' : 'off';
        break;

      case 'converti':
        client.setConvertiMode(device, value);
        device.status.convertiMode = parseInt(value);
        device.status.presetMode = 'none';
        break;

      case 'preset':
        client.setPresetMode(device, value);
        device.status.presetMode = value;
        if (value === 'eco') {
          device.status.temperature = 26.0;
        }
        break;

      default:
        return res.status(400).json({ error: `Unsupported control action: ${action}` });
    }

    // Push the updated status back to any monitoring client immediately
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

app.listen(PORT, () => {
  console.log(`[Server] Panasonic MirAIe AC server running on port ${PORT}`);
  initializeMirAIe();
});
