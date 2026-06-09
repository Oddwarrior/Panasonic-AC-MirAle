import React, { useState, useEffect, useRef } from 'react';
import { Shield, Key, Smartphone, AlertCircle, RefreshCw, RefreshCw as Spinner, LogOut, Moon, Sun, ShieldAlert, Cpu, User } from 'lucide-react';
import TemperatureDial from './components/TemperatureDial';
import ModeSelector from './components/ModeSelector';
import FanSpeedSelector from './components/FanSpeedSelector';
import SwingSelector from './components/SwingSelector';
import PresetSelector from './components/PresetSelector';
import InfoPanel from './components/InfoPanel';
import Analytics from './components/Analytics';
import Workflows from './components/Workflows';
import AiChatbot from './components/AiChatbot';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'miraie_access_token';

// Helper: all API calls go through here so the token is always attached
function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState('');

  // Credentials for manual login
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Device states
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // UI states
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('active_tab') || 'control');

  // Polling ref
  const pollTimerRef = useRef(null);

  // On startup: if a saved token exists, use it to restore the session
  useEffect(() => {
    fetchDevices();

    // Restore theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsLightMode(true);
      document.body.classList.add('light-mode');
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const toggleTheme = () => {
    setIsLightMode(prev => {
      const next = !prev;
      if (next) {
        document.body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
      } else {
        document.body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
      }
      return next;
    });
  };

  const fetchDevices = async () => {
    // No saved token → go straight to login screen
    if (!localStorage.getItem(TOKEN_KEY)) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    try {
      const response = await authFetch(`${API_BASE}/api/devices`);
      if (response.status === 401) {
        // Token is invalid or expired – clear it
        localStorage.removeItem(TOKEN_KEY);
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      setDevices(data);
      setIsAuthenticated(true);
      setError('');

      if (data.length > 0) {
        setSelectedDevice(prev => {
          const match = data.find(d => d.id === prev?.id);
          return match || data[0];
        });
      }
      setLoading(false);
      startPolling();
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError('Connection offline. Make sure the backend server is running and active.');
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const response = await authFetch(`${API_BASE}/api/devices`);
        if (response.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setIsAuthenticated(false);
          clearInterval(pollTimerRef.current);
          return;
        }

        if (!response.ok) return;

        const data = await response.json();
        setDevices(data);
        if (data.length > 0) {
          setSelectedDevice(prev => {
            const match = data.find(d => d.id === prev?.id);
            return match || data[0];
          });
        }
      } catch (err) {
        console.error('Polling status sync failed:', err);
      }
    }, 3000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoginLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Persist the token so this browser stays logged in across refreshes
      localStorage.setItem(TOKEN_KEY, data.accessToken);

      setDevices(data.devices);
      setIsAuthenticated(true);
      if (data.devices.length > 0) {
        setSelectedDevice(data.devices[0]);
      }
      startPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    // Remove token from this browser – other devices keep their own tokens
    localStorage.removeItem(TOKEN_KEY);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    setIsAuthenticated(false);
    setDevices([]);
    setSelectedDevice(null);
  };

  // Dispatch control actions
  const sendControl = async (action, value) => {
    if (!selectedDevice) return;

    // Optimistic Update
    const originalStatus = { ...selectedDevice.status };
    setSelectedDevice(prev => {
      const updatedStatus = { ...prev.status };

      switch (action) {
        case 'power':
          updatedStatus.powerMode = value ? 'on' : 'off';
          break;
        case 'temperature':
          updatedStatus.temperature = Math.round(value);
          break;
        case 'mode':
          updatedStatus.hvacMode = value;
          // eco/boost presets only valid in Cool/Heat; Converti is Cool-only
          if (value === 'dry' || value === 'fan') {
            updatedStatus.presetMode = 'none';
            updatedStatus.convertiMode = 0;
          } else if (value === 'auto') {
            updatedStatus.convertiMode = 0;
            updatedStatus.presetMode = 'none';
          } else {
            updatedStatus.presetMode = 'none'; // cool / heat
          }
          break;
        case 'fanMode':
          updatedStatus.fanMode = value;
          break;
        case 'vSwing':
          updatedStatus.vSwingMode = value;
          break;
        case 'hSwing':
          updatedStatus.hSwingMode = value;
          break;
        case 'display':
          updatedStatus.displayMode = value ? 'on' : 'off';
          break;
        case 'converti':
          updatedStatus.convertiMode = value;
          // Converti mode resets any active preset in the AC protocol
          updatedStatus.presetMode = 'none';
          break;
        case 'preset':
          updatedStatus.presetMode = value;
          // Setting any preset resets Converti to 0 in the AC protocol (cnv: 0)
          updatedStatus.convertiMode = 0;
          if (value === 'eco') updatedStatus.temperature = 26;
          break;
      }

      return { ...prev, status: updatedStatus };
    });

    try {
      const response = await authFetch(`${API_BASE}/api/devices/${selectedDevice.id}/control`, {
        method: 'POST',
        body: JSON.stringify({ action, value })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Control dispatch failed');
      }

      // Re-align with server response
      setSelectedDevice(prev => ({ ...prev, status: data.status }));
    } catch (err) {
      console.error('Control error:', err);
      // Revert on error
      setSelectedDevice(prev => ({ ...prev, status: originalStatus }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
        <Spinner className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-sm font-medium tracking-wide">Syncing with MirAIe servers...</span>
      </div>
    );
  }

  // 1. LOGIN UI
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-md glass-panel p-8 space-y-6 relative z-10">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-2">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-50 tracking-tight">MirAIe AC Control</h1>
            <p className="text-slate-400 text-sm">Sign in with your Panasonic MirAIe credentials</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Phone/Email input */}
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider pl-1">
                Mobile Number or Email
              </label>
              <div className="relative">
                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/translate-y-[-50%] w-5 h-5 text-slate-500" style={{ transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="e.g. +919999999999 or user@email.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                />
              </div>
            </div>

            {/* Password input */}
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider pl-1">
                Password
              </label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 w-5 h-5 text-slate-500" style={{ transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-slate-50 border border-blue-500 font-semibold rounded-xl text-sm transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-blue-500/20"
            >
              {loginLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="text-[10px] text-slate-500 text-center font-medium leading-relaxed">
            Your credentials are secure. They are sent directly to MirAIe servers and never stored or shared.
          </div>
        </div>
      </div>
    );
  }

  // 2. DASHBOARD UI
  const status = selectedDevice?.status || {};
  const isPowerOn = status.powerMode === 'on';

  // Identify model and determine capability support (e.g. HU/HZ series for Heat, XU/HU/HZ series for H-Swing)
  const hasDetails = !!selectedDevice?.details;
  const modelStr = ((selectedDevice?.details?.modelName || '') + ' ' + (selectedDevice?.details?.modelNumber || '')).toUpperCase();
  const supportsHeat = !hasDetails || modelStr.includes('HU') || modelStr.includes('HZ') || modelStr.includes('WZ') || modelStr.includes('MZ') || modelStr.includes('HOT');
  const supportsHSwing = !hasDetails || modelStr.includes('XU') || modelStr.includes('HU') || modelStr.includes('HZ') || modelStr.includes('WZ') || modelStr.includes('MZ');

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden px-4 md:px-8 py-6 max-w-7xl mx-auto">

      {/* Background glow base */}
      <div className="absolute top-10 right-10 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="flex justify-between items-center z-50 relative mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-50 text-base leading-none tracking-tight">
              Home AC Dashboard
            </h1>
            <p className="text-[10px] text-slate-400 font-medium mt-1">
              Panasonic reverse-engineered cloud controller
            </p>
          </div>
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-700 hover:border-blue-500 overflow-hidden flex items-center justify-center transition-all focus:outline-none"
          >
            <User className="w-5 h-5 text-slate-400" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50">

              {/* Devices Section */}
              <div className="px-4 py-2 border-b border-slate-800 mb-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">MY DEVICES</p>
                <div className="space-y-1">
                  {devices.map(dev => (
                    <button
                      key={dev.id}
                      onClick={() => {
                        setSelectedDevice(dev);
                        setShowProfileMenu(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedDevice?.id === dev.id ? 'bg-blue-500/20 text-blue-400' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                      {dev.friendlyName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Section */}
              <div className="px-4 py-2 border-b border-slate-800 mb-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">SETTINGS</p>
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isLightMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-400" />}
                    <span>{isLightMode ? 'Light Mode' : 'Dark Mode'}</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isLightMode ? 'bg-blue-500' : 'bg-slate-700'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isLightMode ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-6 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex gap-4 border-b border-slate-800/50 pb-px mb-6 z-10 relative">
        <button
          onClick={() => { setActiveTab('control'); localStorage.setItem('active_tab', 'control'); }}
          className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'control' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          Control Panel
        </button>
        <button
          onClick={() => { setActiveTab('workflows'); localStorage.setItem('active_tab', 'workflows'); }}
          className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'workflows' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          Schedules & Workflows
        </button>
        <button
          onClick={() => { setActiveTab('analytics'); localStorage.setItem('active_tab', 'analytics'); }}
          className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'analytics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
        >
          Analytics & Usage
        </button>
      </div>

      {activeTab === 'analytics' ? (
        <div className="flex-1 z-10 relative">
          <Analytics deviceId={selectedDevice?.id} token={localStorage.getItem(TOKEN_KEY)} />
        </div>
      ) : activeTab === 'workflows' ? (
        <div className="flex-1 z-10 relative">
          <Workflows selectedDevice={selectedDevice} token={localStorage.getItem(TOKEN_KEY)} />
        </div>
      ) : (
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 flex-1 items-start">

          {/* Left column: Thermostat dial (lg:col-span-5) */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div className="glass-panel p-4 sm:p-6 flex items-center justify-center min-h-[360px]">
              <TemperatureDial
                targetTemp={status.temperature || 24}
                roomTemp={status.roomTemperature || 24.0}
                hvacMode={status.hvacMode || 'auto'}
                powerMode={status.powerMode || 'off'}
                onChange={(val) => sendControl('temperature', val)}
                onPowerToggle={() => sendControl('power', status.powerMode === 'on' ? 'off' : 'on')}
              />
            </div>
          </div>

          {/* Right column: AC Controls Panels (lg:col-span-7, spans vertically over rows on desktop) */}
          <div className="lg:col-span-7 lg:row-span-2 space-y-6">
            <div className="glass-panel p-4 sm:p-6 space-y-6">
              {/* Quick action preset modes (Power, Eco, Powerful, Nanoe) */}
              <PresetSelector
                powerMode={status.powerMode || 'off'}
                presetMode={status.presetMode || 'none'}
                displayMode={status.displayMode || 'on'}
                convertiMode={status.convertiMode || 0}
                onPowerToggle={() => sendControl('power', !isPowerOn)}
                onPresetChange={(val) => sendControl('preset', val)}
                onDisplayToggle={(val) => sendControl('display', val)}
                onConvertiChange={(val) => sendControl('converti', val)}
              />

              <hr className="border-slate-900" />

              {/* Mode Selectors */}
              <ModeSelector
                currentMode={status.hvacMode || 'auto'}
                powerMode={status.powerMode || 'off'}
                supportsHeat={supportsHeat}
                onChange={(val) => sendControl('mode', val)}
              />

              <hr className="border-slate-900" />

              {/* Fan Speed selector */}
              <FanSpeedSelector
                currentSpeed={status.fanMode || 'auto'}
                powerMode={status.powerMode || 'off'}
                onChange={(val) => sendControl('fanMode', val)}
              />

              <hr className="border-slate-900" />

              {/* Swing selector */}
              <SwingSelector
                vSwing={status.vSwingMode || 0}
                hSwing={status.hSwingMode || 0}
                powerMode={status.powerMode || 'off'}
                supportsHSwing={supportsHSwing}
                onVSwingChange={(val) => sendControl('vSwing', val)}
                onHSwingChange={(val) => sendControl('hSwing', val)}
              />
            </div>
          </div>

          {/* InfoPanel: Bottom on mobile, bottom-left on desktop (lg:col-span-5) */}
          <div className="lg:col-span-5">
            <InfoPanel device={selectedDevice} />
          </div>

        </main>
      )}

      {/* Footer */}
      <footer className="mt-8 text-center text-[10px] text-slate-600 font-medium">
        MirAIe Smart AC Dashboard • Designed with premium aesthetics for optimal dark-mode controls
      </footer>

      {isAuthenticated && (
        <AiChatbot
          selectedDevice={selectedDevice}
          token={localStorage.getItem(TOKEN_KEY)}
          sendControl={sendControl}
        />
      )}

    </div>
  );
}
