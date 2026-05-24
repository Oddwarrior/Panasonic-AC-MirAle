import React from 'react';
import { Power, Leaf, ShieldAlert, Sparkles, Tv, Percent } from 'lucide-react';

const convertiStages = [
  { id: 0, name: 'Normal', value: 0 },
  { id: 40, name: '40%', value: 40 },
  { id: 50, name: '50%', value: 50 },
  { id: 70, name: '70%', value: 70 },
  { id: 80, name: '80%', value: 80 },
  { id: 90, name: '90%', value: 90 },
  { id: 100, name: 'Full (100%)', value: 100 },
  { id: 110, name: 'High (110%)', value: 110 }
];

export default function PresetSelector({
  powerMode,
  presetMode,
  displayMode,
  convertiMode,
  onPowerToggle,
  onPresetChange,
  onDisplayToggle,
  onConvertiChange
}) {
  const isPowerOn = powerMode === 'on';
  const isEco = presetMode === 'eco';
  const isBoost = presetMode === 'boost';
  const isClean = presetMode === 'clean';
  const isDisplayOn = displayMode === 'on';

  return (
    <div className="w-full space-y-6">
      
      {/* Power and Quick Actions Row */}
      <div>
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3 px-1">
          Quick Controls
        </h3>
        
        <div className="grid grid-cols-4 gap-3">
          {/* Power Button */}
          <button
            onClick={onPowerToggle}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 active:scale-95 ${
              isPowerOn
                ? 'bg-red-500/10 text-red-500 border-red-500/40 shadow-lg shadow-red-500/5'
                : 'bg-slate-900/60 text-slate-500 border-slate-800'
            }`}
          >
            <Power className="w-6 h-6 mb-2" />
            <span className="text-[11px] font-semibold tracking-wide">
              {isPowerOn ? 'Power On' : 'Power Off'}
            </span>
          </button>

          {/* Eco Mode */}
          <button
            onClick={() => isPowerOn && onPresetChange(isEco ? 'none' : 'eco')}
            disabled={!isPowerOn}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
              isEco
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                : 'bg-slate-900/60 text-slate-400 border-slate-800'
            }`}
          >
            <Leaf className="w-6 h-6 mb-2" />
            <span className="text-[11px] font-semibold tracking-wide">
              Eco Mode
            </span>
          </button>

          {/* Powerful (Boost) Mode */}
          <button
            onClick={() => isPowerOn && onPresetChange(isBoost ? 'none' : 'boost')}
            disabled={!isPowerOn}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
              isBoost
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/40 shadow-lg shadow-amber-500/5 animate-pulse-amber'
                : 'bg-slate-900/60 text-slate-400 border-slate-800'
            }`}
          >
            <ShieldAlert className="w-6 h-6 mb-2" />
            <span className="text-[11px] font-semibold tracking-wide">
              Powerful
            </span>
          </button>

          {/* Nanoe-G (Clean) Mode */}
          <button
            onClick={() => isPowerOn && onPresetChange(isClean ? 'none' : 'clean')}
            disabled={!isPowerOn}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
              isClean
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/40 shadow-lg shadow-sky-500/5'
                : 'bg-slate-900/60 text-slate-400 border-slate-800'
            }`}
          >
            <Sparkles className="w-6 h-6 mb-2" />
            <span className="text-[11px] font-semibold tracking-wide">
              Nanoe-G
            </span>
          </button>
        </div>
      </div>

      {/* Advanced Row (Converti Stages & Display Toggle) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Display Toggle */}
        <div className="sm:col-span-1 flex flex-col justify-between">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
            <Tv className="w-3.5 h-3.5 text-slate-500" />
            <span>AC Display</span>
          </h3>
          <button
            onClick={() => isPowerOn && onDisplayToggle(!isDisplayOn)}
            disabled={!isPowerOn}
            className={`w-full py-4 rounded-2xl border transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none font-semibold text-xs text-center flex items-center justify-center gap-2 ${
              isDisplayOn
                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/40 shadow-lg shadow-indigo-500/5'
                : 'bg-slate-900/60 text-slate-500 border-slate-800'
            }`}
          >
            <span>{isDisplayOn ? 'LED Display On' : 'LED Display Off'}</span>
          </button>
        </div>

        {/* Converti Stages */}
        <div className="sm:col-span-2 flex flex-col justify-between">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-slate-500" />
            <span>Converti Capacity Stage</span>
          </h3>
          
          <div className="flex gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-2xl overflow-x-auto select-none no-scrollbar">
            {convertiStages.map((stage) => {
              const isActive = convertiMode === stage.value && isPowerOn;
              return (
                <button
                  key={stage.id}
                  onClick={() => isPowerOn && onConvertiChange(stage.value)}
                  disabled={!isPowerOn}
                  className={`px-3.5 py-3.5 rounded-xl border border-transparent text-[11px] font-semibold whitespace-nowrap transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
                    isActive
                      ? 'bg-slate-800 text-sky-400 border-slate-700 shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
                  }`}
                >
                  {stage.name}
                </button>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
