import React from 'react';
import { 
  Play, 
  Pause, 
  Trash2, 
  Activity, 
  Binary, 
  LineChart, 
  Wrench, 
  Database,
  Radio,
  Compass,
  HeartPulse
} from 'lucide-react';
import { CockpitTab, BusStats, TelemetrySource } from '../types/can';

interface HeaderProps {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  isRunning: boolean;
  onTogglePlay: () => void;
  onClear: () => void;
  stats: BusStats;
  source: TelemetrySource;
  onSourceChange: (source: TelemetrySource) => void;
  showAttitudeHud: boolean;
  onToggleAttitudeHud: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isRunning,
  onTogglePlay,
  onClear,
  stats,
  source,
  onSourceChange,
  showAttitudeHud,
  onToggleAttitudeHud,
}) => {
  return (
    <header className="bg-surface border-b border-surface-border px-4 py-2 flex flex-col md:flex-row items-center justify-between gap-3 select-none">
      {/* Brand & Connection Mode */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-sm font-mono text-cyan-400">MOTO ANALYZER</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">v0.1.0</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">Honda CL250 Telemetry Cockpit</div>
          </div>
        </div>

        {/* Source Selector */}
        <div className="flex items-center gap-1.5 bg-background border border-surface-border rounded p-1 text-xs font-mono">
          <button
            onClick={() => onSourceChange('virtual')}
            className={`px-2 py-1 rounded transition-colors ${
              source === 'virtual'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Virtual Bus
          </button>
          <button
            onClick={() => onSourceChange('local_file')}
            className={`px-2 py-1 rounded transition-colors ${
              source === 'local_file'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Local Sync
          </button>
          <button
            onClick={() => onSourceChange('websocket')}
            className={`px-2 py-1 rounded transition-colors ${
              source === 'websocket'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            WS Live
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-background border border-surface-border rounded-lg p-1">
        <button
          onClick={() => onTabChange('trace')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'trace'
              ? 'bg-surface-elevated text-cyan-400 shadow-sm border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>CAN Trace</span>
        </button>

        <button
          onClick={() => onTabChange('sniffer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'sniffer'
              ? 'bg-surface-elevated text-amber-400 shadow-sm border border-amber-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Binary className="w-3.5 h-3.5" />
          <span>SavvyCAN Sniffer</span>
        </button>

        <button
          onClick={() => onTabChange('oscilloscope')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'oscilloscope'
              ? 'bg-surface-elevated text-emerald-400 shadow-sm border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LineChart className="w-3.5 h-3.5" />
          <span>Oscilloscope</span>
        </button>

        <button
          onClick={() => onTabChange('uds')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'uds'
              ? 'bg-surface-elevated text-purple-400 shadow-sm border border-purple-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>UDS Diag</span>
        </button>

        <button
          onClick={() => onTabChange('health')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'health'
              ? 'bg-surface-elevated text-rose-400 shadow-sm border border-rose-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <HeartPulse className="w-3.5 h-3.5" />
          <span>Health W1-W5</span>
        </button>

        <button
          onClick={() => onTabChange('sync')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'sync'
              ? 'bg-surface-elevated text-sky-400 shadow-sm border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>DBC & Logs</span>
        </button>
      </nav>

      {/* Bus Stats & Play Controls */}
      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        {/* Real-time Bus Telemetry Stats */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Bus Load</span>
            <span className={`font-semibold ${stats.busLoadPct > 70 ? 'text-danger' : stats.busLoadPct > 40 ? 'text-accent' : 'text-success'}`}>
              {stats.busLoadPct.toFixed(1)}%
            </span>
          </div>

          <div className="h-6 w-px bg-surface-border" />

          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Rx Rate</span>
            <span className="text-slate-200 font-semibold">{stats.msgPerSec} <span className="text-[10px] text-slate-400 font-normal">Hz</span></span>
          </div>

          <div className="h-6 w-px bg-surface-border" />

          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Total Rx</span>
            <span className="text-slate-200 font-semibold">{stats.totalRx.toLocaleString()}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Toggle Lean Angle HUD */}
          <button
            onClick={onToggleAttitudeHud}
            className={`p-2 rounded font-mono text-xs flex items-center gap-1.5 transition-all border ${
              showAttitudeHud
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'bg-surface-elevated text-slate-400 border-surface-border hover:text-slate-200'
            }`}
            title="Toggle Lean Angle & Dynamics HUD"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">HUD</span>
          </button>

          <button
            onClick={onTogglePlay}
            className={`p-2 rounded font-mono text-xs flex items-center gap-1.5 transition-all shadow-sm ${
              isRunning
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40'
            }`}
            title={isRunning ? "Pause Telemetry Stream" : "Resume Telemetry Stream"}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isRunning ? 'PAUSE' : 'START'}</span>
          </button>

          <button
            onClick={onClear}
            className="p-2 rounded bg-surface-elevated hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-surface-border transition-colors"
            title="Clear Buffer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
