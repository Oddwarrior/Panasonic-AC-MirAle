# Self-Hostable Panasonic MirAIe Smart AC Web Dashboard & Controller

An open-source, premium, responsive dark-mode web application and dashboard designed to replace or run alongside the official Panasonic MirAIe mobile app. Perfect for self-hosting on a home server (like a Raspberry Pi), a local machine, or a cloud server (like Render or Heroku) to control and monitor smart air conditioners.

This codebase also serves as a robust reference implementation for developers wishing to understand and build custom integrations (e.g., Home Assistant, custom scripts) around the reverse-engineered Panasonic MirAIe REST and MQTT API endpoints.

![App Logo](frontend/public/logo192.png)

## Core Capabilities

- **Interactive SVG Thermostat Dial**: A premium, Nest-style rotary temperature control supporting mouse drag, touch drag, and direct +/- inputs tailored beautifully for both mobile and desktop screens.
- **Standby UI & Quick-Power Action**: A dedicated standby screen displayed when the AC is offline or off, offering pulsing status states, room temperature telemetry, and a quick-power toggle.
- **Reverse-Engineered Hybrid Pipeline**:
  - **REST API Wrapper**: Authenticates with MirAIe, discovers registered home profiles and devices, and performs regular state syncing.
  - **TLS MQTT Broker Integration**: Subscribes directly to `mqtts://mqtt.miraie.in:8883` to receive instantaneous status changes and broadcast command requests.
- **Database Telemetry Logging**: Automatically logs all historical telemetry data (power mode, HVAC mode, target temp, room temp, fan/swing speeds, and current wattage draw) to a **MongoDB** database.
- **Analytics & Geographic Cost Tracking**:
  - Automatically queries device coordinate metadata.
  - Reverse-geocodes coordinates via OpenStreetMap's public Nominatim API (or falls back to built-in bounding-box state coordinates) to estimate electricity costs based on Indian state residential tariffs.
  - Supports custom user-defined tariff overrides saved locally per-device.
  - Automatically handles the MirAIe 6-month historical query limit by parallel-chunking dates.
- **Dynamic Feature Filtering**: Auto-detects device series capability (e.g., hiding Heat Mode or Horizontal Swing options for single-swing cool-only `SU` series models, while exposing them for hot/cold `XU`/`HU`/`HZ` series).
- **Progressive Web App (PWA)**: Mobile-installable manifest and offline-first service worker cache, enabling immediate installation on iOS and Android devices directly from your web browser.

---

## Technical Stack

- **Frontend**: React 19, Vite, Recharts, Tailwind CSS / Vanilla CSS, Lucide icons, PWA Service Worker.
- **Backend**: Node.js, Express, Axios, MQTT.js, MongoDB (MongoClient), Dotenv.

---

## Directory Structure

```text
panasonic-ac/
├── backend/
│   ├── .env               # Server & database environment variables
│   ├── server.js          # Express endpoints, MongoDB connection, background MQTT worker
│   ├── miraieClient.js    # Panasonic REST wrapper & TLS MQTT client
│   └── cryptoHelper.js    # AES-256-CBC credential encryption utility
├── frontend/
│   ├── index.html         # HTML entry point with PWA meta headers
│   ├── vite.config.js     # Dev server configuration with /api proxy rules
│   ├── public/
│   │   ├── manifest.json  # PWA installation manifest
│   │   └── sw.js          # Service worker offline caching rules
│   └── src/
│       ├── main.jsx       # App bootstrap and SW registration
│       ├── App.jsx        # App state router, login gate, and layout grid
│       └── components/    # Thermostat dial, selectors, analytics, and sidebars
└── research/              # Reference scripts documenting reverse-engineered API payloads
```

---

## Hosting & Deployment Guide

You can host this application locally in your home network or deploy it to a public cloud service.

### Option A: Local Hosting (Home Server, Raspberry Pi, Local PC)

For a continuous home server installation:
1. Ensure **Node.js** (v18+) and **MongoDB** (local community edition or Atlas) are running.
2. Clone the repository to your server.
3. Install dependencies in both the `backend/` and `frontend/` folders.
4. Use a process manager like **PM2** to keep the backend running persistently:
   ```bash
   npm install -g pm2
   cd backend
   pm2 start server.js --name "miraie-backend"
   ```
5. Build and serve the frontend production bundle:
   ```bash
   cd ../frontend
   npm install
   npm run build
   ```
   You can serve the resulting `dist/` directory using Nginx, Apache, or PM2's static server.

### Option B: Cloud Hosting (Render, Heroku, etc.)

1. Deploy the backend to a cloud platform. The backend includes a Render-specific keep-alive ping loop (`RENDER_EXTERNAL_URL`) that automatically self-pings the server every 12 minutes to prevent spin-down on free-tier hosting.
2. Set up a free-tier MongoDB instance using **MongoDB Atlas**.
3. Configure the environment variables in your cloud hosting dashboard (see **Configuration** below).
4. Deploy the frontend code to a static hosting service (Netlify, Vercel, or Render static site) and configure the API rewrite proxy rules to route `/api/*` requests to your deployed backend URL.

---

## Configuration & Setup

### 1. Configure the Backend `.env`
Create a `.env` file in the `backend/` directory with the following variables:
```env
PORT=5005
MONGODB_URI="your_mongodb_connection_uri"

# Optional: Automatic boot credentials.
# If configured, the backend automatically initializes background MQTT loggers for this user.
# If left blank, background loggers spawn dynamically when users log in via the Web UI.
MIRAIE_MOBILE="+91xxxxxxxxxx"     # Include country code (e.g. +91 for India)
MIRAIE_PASSWORD="your_password"
MIRAIE_CLIENT_ID="PBcMcfG19njNCL8AOgvRzIC8AjQa"
```

### 2. Run the Application locally
**Start the backend server:**
```bash
cd backend
npm install
npm start
```
The server will run on `http://localhost:5005` and establish a connection to your MongoDB instance.

**Start the frontend development server:**
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Vite will start the dev server and output:
- **Local**: `http://localhost:5173/`
- **Network**: `http://<your-server-ip>:5173/` (Load this URL on mobile devices connected to the same Wi-Fi network).

---

## PWA Mobile Installation

Once hosted, you can install the dashboard as an app on your smartphone:

### 📱 iOS (Safari)
1. Open **Safari** on your iPhone and navigate to your hosted application URL.
2. Tap the **Share** button in Safari's bottom toolbar.
3. Scroll down, select **Add to Home Screen**, confirm the name, and tap **Add**.

### 🤖 Android (Google Chrome)
1. Open **Chrome** on your Android device and navigate to your hosted application URL.
2. Tap the **Add to Home screen** popup at the bottom of the screen, or choose **Install app** from Chrome's top-right three-dot menu.
