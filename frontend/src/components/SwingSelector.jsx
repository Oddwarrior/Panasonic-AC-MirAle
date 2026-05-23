import React from 'react';
import { AlignJustify, Move } from 'lucide-react';

const swingPositions = [
  { id: 0, label: 'Auto' },
  { id: 1, label: '1' },
  { id: 2, label: '2' },
  { id: 3, label: '3' },
  { id: 4, label: '4' },
  { id: 5, label: '5' }
];

export default function SwingSelector({
  vSwing,
  hSwing,
  powerMode,
  supportsHSwing = true,
  onVSwingChange,
  onHSwingChange
}) {
  const isPowerOn = powerMode === 'on';

  return (
    <div className={`w-full grid gap-4 ${supportsHSwing ? 'grid-cols-2' : 'grid-cols-1'}`}>
      
      {/* Vertical Swing (V-Swing) */}
      <div className="flex flex-col">
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
          <AlignJustify className="w-3.5 h-3.5 rotate-90 text-slate-500" />
          <span>Vertical Swing</span>
        </h3>
        
        <div className="grid grid-cols-6 p-1 bg-slate-950/60 border border-slate-900 rounded-xl w-full">
          {swingPositions.map((pos) => {
            const isActive = vSwing === pos.id && isPowerOn;
            return (
              <button
                key={`v-${pos.id}`}
                onClick={() => isPowerOn && onVSwingChange(pos.id)}
                disabled={!isPowerOn}
                className={`py-2 rounded-lg border border-transparent text-[11px] font-medium transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
                  isActive
                    ? 'bg-slate-800 text-sky-400 border-slate-700 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {pos.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Horizontal Swing (H-Swing) */}
      {supportsHSwing && (
        <div className="flex flex-col">
          <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
            <AlignJustify className="w-3.5 h-3.5 text-slate-500" />
            <span>Horizontal Swing</span>
          </h3>
          
          <div className="grid grid-cols-6 p-1 bg-slate-950/60 border border-slate-900 rounded-xl w-full">
            {swingPositions.map((pos) => {
              const isActive = hSwing === pos.id && isPowerOn;
              return (
                <button
                  key={`h-${pos.id}`}
                  onClick={() => isPowerOn && onHSwingChange(pos.id)}
                  disabled={!isPowerOn}
                  className={`py-2 rounded-lg border border-transparent text-[11px] font-medium transition-all duration-300 active:scale-95 disabled:opacity-20 disabled:pointer-events-none ${
                    isActive
                      ? 'bg-slate-800 text-sky-400 border-slate-700 font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pos.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
