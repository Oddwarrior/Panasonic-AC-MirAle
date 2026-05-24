import React from 'react';
import { Plus, Minus, Thermometer, Power } from 'lucide-react';

export default function TemperatureDial({
  targetTemp,
  roomTemp,
  hvacMode,
  powerMode,
  onChange,
  onPowerToggle
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
  const strokeOffset = isPowerOn ? (maxArcLength - tempPercentage * maxArcLength) : maxArcLength;

  return (
    <div className="flex flex-col items-center select-none w-full">
      {/* Dial Panel */}
      <div className={`relative flex items-center justify-center rounded-full w-64 h-64 md:w-72 md:h-72 border backdrop-blur-md bg-slate-900/40 transition-all duration-700 ${getGlowClass()}`}>

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
        {isPowerOn ? (
          <div className="z-10 flex flex-col items-center justify-center text-center w-full px-4">
            <span className="text-slate-400 font-medium text-[10px] md:text-xs tracking-wider uppercase mb-1">
              Target Temp
            </span>

            {/* Controls Row: Decrement, Value, Increment */}
            <div className="flex items-center justify-center gap-3.5 md:gap-5 my-1.5 md:my-2 w-full">
              {/* Decrement Button */}
              <button
                onClick={handleDecrement}
                disabled={targetTemp <= minTemp}
                className="flex items-center justify-center rounded-full bg-slate-950/60 hover:bg-slate-800 border border-slate-800/80 w-9 h-9 md:w-11 md:h-11 text-slate-350 hover:text-slate-100 disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all shadow-md"
              >
                <Minus className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              {/* Temperature display */}
              <div className="flex items-baseline font-bold text-slate-50 min-w-[70px] md:min-w-[90px] justify-center">
                <span className="text-5xl md:text-6xl tracking-tighter transition-all duration-300">
                  {Math.round(targetTemp)}
                </span>
                <span className="text-xl md:text-2xl ml-0.5 text-slate-350">
                  °C
                </span>
              </div>

              {/* Increment Button */}
              <button
                onClick={handleIncrement}
                disabled={targetTemp >= maxTemp}
                className="flex items-center justify-center rounded-full bg-slate-950/60 hover:bg-slate-800 border border-slate-800/80 w-9 h-9 md:w-11 md:h-11 text-slate-350 hover:text-slate-100 disabled:opacity-20 disabled:pointer-events-none active:scale-95 transition-all shadow-md"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>

            {/* Room Temperature readout */}
            <div className="flex items-center gap-1.5 mt-2 px-3 py-1 bg-slate-950/40 border border-slate-800/60 rounded-full text-slate-400 text-xs">
              <Thermometer className="w-3.5 h-3.5 text-slate-500" />
              <span>Room: {roomTemp.toFixed(1)}°C</span>
            </div>
          </div>
        ) : (
          <div className="z-10 flex flex-col items-center justify-center text-center px-4">
            <button
              onClick={onPowerToggle}
              className="group flex flex-col items-center justify-center p-3 rounded-full border border-slate-800 bg-slate-950/50 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-slate-500 hover:text-emerald-400 transition-all duration-300 w-12 h-12 md:w-14 md:h-14 shadow-lg hover:shadow-emerald-500/5 active:scale-95 cursor-pointer mb-2"
            >
              <Power className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
            </button>
            <span className="text-slate-500 font-semibold text-[9px] md:text-[10px] tracking-widest uppercase mb-1">
              Power Off
            </span>
            {/* Room Temperature readout */}
            <div className="flex items-center gap-1.5 mt-1 px-2.5 py-0.5 bg-slate-950/20 border border-slate-900 rounded-full text-slate-500 text-[10px] md:text-xs">
              <Thermometer className="w-3 h-3 text-slate-600" />
              <span>Room: {roomTemp.toFixed(1)}°C</span>
            </div>
          </div>
        )}
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
