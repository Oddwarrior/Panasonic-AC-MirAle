import React from 'react';
import { Snowflake, Droplets, RefreshCw, Wind, Sun } from 'lucide-react';

const modes = [
  { id: 'cool', name: 'Cool', icon: Snowflake, color: 'text-blue-400 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/40', activeColor: 'bg-blue-600 text-slate-50 border-blue-500 shadow-lg shadow-blue-500/20' },
  { id: 'dry', name: 'Dry', icon: Droplets, color: 'text-purple-400 border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 hover:border-purple-500/40', activeColor: 'bg-purple-600 text-slate-50 border-purple-500 shadow-lg shadow-purple-500/20' },
  { id: 'auto', name: 'Auto', icon: RefreshCw, color: 'text-amber-400 border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/40', activeColor: 'bg-amber-600 text-slate-50 border-amber-500 shadow-lg shadow-amber-500/20' },
  { id: 'fan', name: 'Fan', icon: Wind, color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40', activeColor: 'bg-emerald-600 text-slate-50 border-emerald-500 shadow-lg shadow-emerald-500/20' },
  { id: 'heat', name: 'Heat', icon: Sun, color: 'text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40', activeColor: 'bg-red-600 text-slate-50 border-red-500 shadow-lg shadow-red-500/20' }
];

export default function ModeSelector({ currentMode, powerMode, supportsHeat = true, onChange }) {
  const isPowerOn = powerMode === 'on';
  const visibleModes = supportsHeat ? modes : modes.filter(m => m.id !== 'heat');

  return (
    <div className="w-full">
      <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3 px-1">
        Operation Mode
      </h3>
      <div className={`grid gap-2 ${supportsHeat ? 'grid-cols-5' : 'grid-cols-4'}`}>
        {visibleModes.map((mode) => {
          const Icon = mode.icon;
          const isActive = currentMode === mode.id && isPowerOn;
          
          return (
            <button
              key={mode.id}
              onClick={() => isPowerOn && onChange(mode.id)}
              disabled={!isPowerOn}
              className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
                isActive ? mode.activeColor : mode.color
              }`}
            >
              <Icon className={`w-5 h-5 mb-1.5 ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[11px] font-medium tracking-wide">
                {mode.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
