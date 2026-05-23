import React from 'react';
import { Plus, Minus, Thermometer } from 'lucide-react';

export default function TemperatureDial({
  targetTemp,
  roomTemp,
  hvacMode,
  powerMode,
  onChange
}) {
  const minTemp = 16;
  const maxTemp = 30;
  const range = maxTemp - minTemp;
  const isPowerOn = powerMode === 'on';

  // Increment/Decrement by 1 degree
  const handleIncrement = () => {
    if (targetTemp < maxTemp) {
      onChange(targetTemp + 1);
    }
  };

  const handleDecrement = () => {
    if (targetTemp > minTemp) {
      onChange(targetTemp - 1);
    }
  };

  const handleSliderChange = (e) => {
    onChange(parseFloat(e.target.value));
  };

  // Color mapping based on HVAC mode
  const getGlowClass = () => {
    if (!isPowerOn) return 'border-slate-800/80 shadow-slate-950/20';
    switch (hvacMode) {
      case 'cool': return 'glow-cool border-blue-500/30';
      case 'heat': return 'glow-heat border-red-500/30';
      case 'dry': return 'glow-dry border-purple-500/30';
      case 'fan': return 'glow-fan border-emerald-500/30';
      case 'auto':
      default: return 'glow-auto border-amber-500/30';
    }
  };

  const getAccentColor = () => {
    if (!isPowerOn) return '#475569'; // slate-600
    switch (hvacMode) {
      case 'cool': return '#3b82f6'; // blue-500
      case 'heat': return '#ef4444'; // red-500
      case 'dry': return '#a855f7'; // purple-500
      case 'fan': return '#10b981'; // emerald-500
      case 'auto':
      default: return '#f59e0b'; // amber-500
    }
  };

  // SVG Gauge calculations
  // Gauge is a 270 degree arc from 135 deg to 405 deg.
  // Radius = 85, Center = 100, Circumference = 2 * Math.PI * 85 = 534
  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  const gaugeAngle = 270;
  const maxArcLength = (gaugeAngle / 360) * circumference; // ~400
  const dashArray = `${maxArcLength} ${circumference}`;

  const tempPercentage = Math.min(Math.max((targetTemp - minTemp) / range, 0), 1);
  const strokeOffset = maxArcLength - tempPercentage * maxArcLength;

  return (
    <div className="flex flex-col items-center select-none w-full">
      {/* Dial Panel */}
      <div className={`relative flex items-center justify-center rounded-full w-72 h-72 border backdrop-blur-md bg-slate-900/40 transition-all duration-700 ${getGlowClass()}`}>

        {/* SVG Arc Gauge */}
        <svg className="absolute -rotate-90 w-full h-full transform" viewBox="0 0 200 200">
          {/* Background Track */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="#1e293b" // slate-800
            strokeWidth="8"
            strokeDasharray={dashArray}
            strokeDashoffset="0"
            strokeLinecap="round"
            transform="rotate(135 100 100)"
          />
          {/* Active Status Track */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={getAccentColor()}
            strokeWidth="10"
            strokeDasharray={dashArray}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            transform="rotate(135 100 100)"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Control UI */}
        <div className="z-10 flex flex-col items-center justify-center text-center">
          <span className="text-slate-400 font-medium text-xs tracking-wider uppercase mb-1">
            Target Temp
          </span>
          <div className="flex items-baseline font-bold text-slate-50">
            <span className="text-6xl tracking-tighter transition-all duration-300">
              {isPowerOn ? Math.round(targetTemp) : '--'}
            </span>
            <span className={`text-2xl ml-0.5 ${isPowerOn ? 'text-slate-300' : 'text-slate-600'}`}>
              °C
            </span>
          </div>

          {/* Room Temperature readout */}
          <div className="flex items-center gap-1.5 mt-3 px-3 py-1 bg-slate-950/40 border border-slate-800/60 rounded-full text-slate-400 text-xs">
            <Thermometer className="w-3.5 h-3.5 text-slate-500" />
            <span>Room: {roomTemp.toFixed(1)}°C</span>
          </div>
        </div>

        {/* Floating Controls */}
        <div className="absolute inset-x-4 flex justify-between items-center h-full pointer-events-none">
          <button
            onClick={handleDecrement}
            disabled={!isPowerOn || targetTemp <= minTemp}
            className="pointer-events-auto flex items-center justify-center rounded-full bg-slate-950/80 hover:bg-slate-800 border border-slate-800/80 w-11 h-11 text-slate-300 hover:text-slate-100 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all shadow-lg"
          >
            <Minus className="w-5 h-5" />
          </button>

          <button
            onClick={handleIncrement}
            disabled={!isPowerOn || targetTemp >= maxTemp}
            className="pointer-events-auto flex items-center justify-center rounded-full bg-slate-950/80 hover:bg-slate-800 border border-slate-800/80 w-11 h-11 text-slate-300 hover:text-slate-100 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modern Horizontal Slider (for fast adjustment) */}
      <div className="mt-8 px-4 w-full max-w-xs">
        <div className="flex justify-between text-slate-500 text-xs px-1 mb-2">
          <span>16°C</span>
          <span>Target Settings</span>
          <span>30°C</span>
        </div>
        <input
          type="range"
          min={minTemp}
          max={maxTemp}
          step="1"
          value={targetTemp}
          onChange={handleSliderChange}
          disabled={!isPowerOn}
          className="accent-blue-500 bg-slate-800 rounded-lg appearance-none cursor-pointer w-full h-1.5 disabled:opacity-20 disabled:cursor-not-allowed"
          style={{
            background: isPowerOn
              ? `linear-gradient(to right, ${getAccentColor()} 0%, ${getAccentColor()} ${((targetTemp - minTemp) / range) * 100}%, #1e293b ${((targetTemp - minTemp) / range) * 100}%, #1e293b 100%)`
              : '#1e293b'
          }}
        />
      </div>
    </div>
  );
}
