# Panasonic MirAIe Smart AC Web Dashboard

A premium, responsive, dark-mode web dashboard to replace the Panasonic MirAIe mobile application for controlling smart air conditioners. This project features a Nest/HomeKit-style interface optimized for mobile and desktop viewports, installable as a Progressive Web App (PWA).

![App Logo](frontend/public/logo192.png)

## Key Features

- **Nest/HomeKit Style Dial**: Interactive SVG circular temperature dial supporting mouse-drag and touch-drag rotary controls.
- **Hybrid Communication Pipeline**:
  - **REST API** for authentication, device discovery, and state sync polling (every 12 seconds).
  - **MQTT Server (`mqtts://mqtt.miraie.in:8883`)** for instant command dispatch and real-time status updates.
- **Automated Capability Filtering**: Dynamically queries device model information from MirAIe. It automatically hides unsupported features like **Heat mode** and **Horizontal Swing** for single-swing cool-only models (such as the `SU` series), while enabling them for dual-swing hot & cold models (`XU`/`HU`/`HZ`).
- **PWA Ready**: Complete Progressive Web App integration with service worker caching, custom neon branding icons, and standard manifest support for installation on Android and iOS devices.
- **Secure Sessions**: Includes local credentials template protection and a secure session tear-down (logout) that instantly kills active TLS MQTT socket connections and wipes memory buffers.

---

## Technical Stack

- **Frontend**: Vite, React 19, Tailwind CSS, Lucide React, PWA (Manifest & Service Worker)
- **Backend**: Node.js, Express, Axios, MQTT.js, Dotenv

---

## Directory Structure

```text
panasonic-ac/
├── backend/
│   ├── .env               # Local credential variables
│   ├── server.js          # Express endpoints, routing, and background REST polling
│   └── miraieClient.js    # MirAIe REST wrapper & TLS MQTT client controls
├── frontend/
│   ├── index.html         # HTML entry point with PWA meta headers
│   ├── vite.config.js     # Vite configuration with /api reverse proxy and network host bindings
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   └── sw.js          # Offline-first resource caching service worker
│   └── src/
│       ├── main.jsx       # App bootstrap and service worker registration
│       ├── App.jsx        # Responsive control grid controller & login screen
│       └── components/    # Thermostat dial, selectors, and diagnostics sidebar
└── research/              # Reference Python scripts documenting the reverse-engineered API
```

---

## Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### 2. Configure Credentials
Create a `.env` file in the `backend/` directory based on the following format:
```env
PORT=5005
MIRAIE_MOBILE="+91xxxxxxxxxx"     # Include country code (e.g. +91 for India)
MIRAIE_PASSWORD="your_password"
MIRAIE_CLIENT_ID="PBcMcfG19njNCL8AOgvRzIC8AjQa"
```

### 3. Install & Start Backend
```bash
cd backend
npm install
npm start
```
The server will boot up on port `5005` and attempt auto-login. If the `.env` placeholders are unchanged, the server will wait for you to log in manually via the Web UI.

### 4. Install & Start Frontend
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
The application will boot up and print two URLs:
- **Local**: `http://localhost:5173/`
- **Network**: `http://<your-mac-ip>:5173/` (Use this URL to view the dashboard on your phone).

---

## PWA Mobile Installation

### 📱 iOS (Safari)
1. Open **Safari** on your phone and load the **Network** URL (e.g. `http://192.168.0.100:5173`).
2. Tap the **Share** button in the bottom toolbar.
3. Select **Add to Home Screen**, confirm the name, and tap **Add**.

### 🤖 Android (Google Chrome)
1. Open **Chrome** on your phone and load the **Network** URL.
2. Tap the **Add to Home screen** popup that slides up at the bottom, or select **Install app** from the top-right three-dot menu.
