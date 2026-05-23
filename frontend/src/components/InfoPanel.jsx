import React from 'react';
import { Info, Wifi, WifiOff, Cpu, ShieldCheck, Tag } from 'lucide-react';

export default function InfoPanel({ device }) {
  if (!device) return null;

  const isOnline = device.status?.isOnline;
  const details = device.details || {};

  return (
    <div className="w-full space-y-4">
      {/* Connection Header Card */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all duration-500 ${
        isOnline
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
          : 'bg-rose-500/5 border-rose-500/20 text-rose-400'
      }`}>
        <div className="flex items-center gap-2">
          {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          <div>
            <h4 className="font-semibold text-slate-100 text-sm">
              {isOnline ? 'Connected' : 'Offline'}
            </h4>
            <p className="text-[10px] text-slate-500 font-medium">
              {isOnline ? 'Live MQTT telemetry active' : 'Device unreachable on cloud'}
            </p>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
          isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
        }`}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Diagnostics / Hardware Info Panel */}
      <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-3xl space-y-3.5">
        <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-900">
          <Info className="w-3.5 h-3.5 text-slate-500" />
          <span>Device Information</span>
        </h4>
        
        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
          {/* Friendly Name */}
          <div className="space-y-0.5">
            <span className="text-slate-500 font-medium text-[10px] uppercase">Device Name</span>
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-600" />
              <span>{device.friendlyName}</span>
            </div>
          </div>

          {/* Model Name */}
          <div className="space-y-0.5">
            <span className="text-slate-500 font-medium text-[10px] uppercase">Model Name</span>
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-slate-600" />
              <span>{details.modelName || 'Panasonic AC'}</span>
            </div>
          </div>

          {/* MAC Address */}
          <div className="space-y-0.5">
            <span className="text-slate-500 font-medium text-[10px] uppercase">MAC Address</span>
            <div className="font-medium text-slate-400 font-mono text-[11px]">
              {details.macAddress || 'xx:xx:xx:xx:xx:xx'}
            </div>
          </div>

          {/* Firmware Version */}
          <div className="space-y-0.5">
            <span className="text-slate-500 font-medium text-[10px] uppercase">Firmware</span>
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-slate-600" />
              <span>v{details.firmwareVersion || '1.0.0'}</span>
            </div>
          </div>

          {/* Serial Number */}
          <div className="col-span-2 space-y-0.5">
            <span className="text-slate-500 font-medium text-[10px] uppercase">Serial Number</span>
            <div className="font-medium text-slate-400 font-mono text-[11px] truncate">
              {details.serialNumber || 'N/A'}
            </div>
          </div>

          {/* MQTT Base Topic */}
          <div className="col-span-2 space-y-0.5 pt-1.5 border-t border-slate-900">
            <span className="text-slate-500 font-medium text-[10px] uppercase">MQTT Base Topic</span>
            <div className="font-medium text-slate-500 font-mono text-[10px] truncate">
              {device.baseTopic || 'miraie/topic/device'}
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
