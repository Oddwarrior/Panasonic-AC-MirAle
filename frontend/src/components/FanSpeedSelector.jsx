import React from 'react';
import { Fan } from 'lucide-react';

const speeds = [
  { id: 'auto', name: 'Auto', bars: 0 },
  { id: 'quiet', name: 'Quiet', bars: 1 },
  { id: 'low', name: 'Low', bars: 2 },
  { id: 'medium', name: 'Medium', bars: 3 },
  { id: 'high', name: 'High', bars: 4 }
];

export default function FanSpeedSelector({ currentSpeed, powerMode, onChange }) {
  const isPowerOn = powerMode === 'on';

  const getBarsIndicator = (speedId) => {
    const activeSpeed = speeds.find(s => s.id === speedId);
    if (!activeSpeed) return null;
    
    return (
      <div className="flex gap-0.5 items-end h-3 ml-1">
        {[1, 2, 3, 4].map((barNum) => (
          <div
            key={barNum}
            className={`w-0.75 rounded-t-sm transition-all duration-300 ${
              barNum <= activeSpeed.bars
                ? isPowerOn ? 'bg-sky-400 h-full' : 'bg-slate-600 h-full'
                : 'bg-slate-700 h-1.5'
            }`}
            style={{ width: '3px' }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 mb-3 px-1">
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
          Fan Speed
        </h3>
        {isPowerOn && (
          <span className="text-[10px] bg-slate-900/60 border border-slate-800 text-slate-400 rounded-full px-2 py-0.5 font-medium tracking-wide">
            {currentSpeed.toUpperCase()}
          </span>
        )}
      </div>

      {/* Segmented Selector Container */}
      <div className="flex p-1.5 bg-slate-950/60 border border-slate-900 rounded-2xl w-full">
        {speeds.map((speed) => {
          const isActive = currentSpeed === speed.id && isPowerOn;
          
          return (
            <button
              key={speed.id}
              onClick={() => isPowerOn && onChange(speed.id)}
              disabled={!isPowerOn}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-xl border border-transparent transition-all duration-300 active:scale-95 disabled:opacity-25 disabled:pointer-events-none ${
                isActive
                  ? 'bg-slate-800 text-slate-100 border-slate-700 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <span className="text-xs tracking-wide">
                {speed.name}
              </span>
              {speed.bars > 0 && getBarsIndicator(speed.id)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
