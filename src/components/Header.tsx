import React from 'react';
import { Play, Pause, Trash2, Activity, Binary, LineChart, Wrench, Database, Radio, Compass, HeartPulse } from 'lucide-react';
import { BusRole, CockpitTab, TelemetrySource } from '../types/can';
import type { BusLoad } from '../state/captureStore';
import type { WsStatus } from '../App';

interface HeaderProps {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  isRunning: boolean;
  onTogglePlay: () => void;
  onClear: () => void;
  busLoad: Map<string, BusLoad>;
  msgPerSec: number;
  totalRx: number;
  source: TelemetrySource;
  onSourceChange: (source: TelemetrySource) => void;
  usbRole: BusRole;
  onUsbRoleChange: (role: BusRole) => void;
  wsUrl: string;
  onWsUrlChange: (url: string) => void;
  wsStatus: WsStatus;
  defsRef: string;
  customDbc: string | null;
  showAttitudeHud: boolean;
  onToggleAttitudeHud: () => void;
}

const TABS: { id: CockpitTab; label: string; icon: React.ElementType; tone: string }[] = [
  { id: 'trace', label: 'CAN Trace', icon: Activity, tone: 'text-cyan-400 border-cyan-500/30' },
  { id: 'sniffer', label: 'Sniffer', icon: Binary, tone: 'text-amber-400 border-amber-500/30' },
  { id: 'oscilloscope', label: 'Oscilloscope', icon: LineChart, tone: 'text-emerald-400 border-emerald-500/30' },
  { id: 'uds', label: 'UDS Diag', icon: Wrench, tone: 'text-purple-400 border-purple-500/30' },
  { id: 'health', label: 'Health', icon: HeartPulse, tone: 'text-rose-400 border-rose-500/30' },
  { id: 'sync', label: 'Defs & Logs', icon: Database, tone: 'text-sky-400 border-sky-500/30' },
];

const SOURCES: { id: TelemetrySource; label: string; title: string }[] = [
  { id: 'virtual', label: 'Virtual Bus', title: 'Simulated CL250 vehicle bus + platform bus' },
  { id: 'local_file', label: 'Log Replay', title: 'Replay an .asc or .csv log' },
  { id: 'websocket', label: 'WS Live', title: 'moto-server live stream' },
  { id: 'webserial', label: 'USB CAN', title: 'SLCAN adapter, opened listen-only' },
];

const loadTone = (pct: number) => (pct > 70 ? 'text-danger' : pct > 40 ? 'text-accent' : 'text-success');

export const Header: React.FC<HeaderProps> = (p) => {
  const buses = [...p.busLoad.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <header className="bg-surface border-b border-surface-border px-4 py-2 flex flex-col xl:flex-row items-center justify-between gap-3 select-none">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-sm font-mono text-cyan-400">MOTO ANALYZER</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                  p.customDbc ? 'bg-amber-950/50 text-amber-300 border-amber-700' : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title={p.customDbc ? `Platform bus decoded with ${p.customDbc} (not moto-vehicle-defs)` : 'Pinned moto-vehicle-defs tag'}
              >
                {p.customDbc ? `custom DBC: ${p.customDbc}` : `defs ${p.defsRef}`}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">Honda CL250 · passive observer</div>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-background border border-surface-border rounded p-1 text-xs font-mono">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => p.onSourceChange(s.id)}
              title={s.title}
              className={`px-2 py-1 rounded transition-colors ${
                p.source === s.id ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {p.source === 'webserial' && (
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400" title="Bus the adapter is plugged into; it picks the DBC used for decoding">
            adapter on
            <select
              value={p.usbRole}
              onChange={(e) => p.onUsbRoleChange(e.target.value as BusRole)}
              className="bg-background border border-surface-border rounded px-1.5 py-0.5 text-slate-200"
            >
              <option value="vehicle">vehicle bus (DLC)</option>
              <option value="platform">platform bus</option>
            </select>
          </label>
        )}
        {p.source === 'websocket' && (
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            <input
              value={p.wsUrl}
              onChange={(e) => p.onWsUrlChange(e.target.value)}
              className="bg-background border border-surface-border rounded px-1.5 py-0.5 text-slate-200 w-52"
            />
            <span
              className={
                p.wsStatus === 'connected' ? 'text-emerald-400' : p.wsStatus === 'connecting' ? 'text-amber-400' : 'text-rose-400'
              }
            >
              {p.wsStatus}
            </span>
          </label>
        )}
      </div>

      <nav className="flex items-center gap-1 bg-background border border-surface-border rounded-lg p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => p.onTabChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
              p.activeTab === t.id ? `bg-surface-elevated shadow-sm ${t.tone}` : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 font-mono text-xs">
          {buses.length === 0 ? (
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-slate-400 uppercase tracking-wider">Bus load</span>
              <span className="text-slate-500">–</span>
            </div>
          ) : (
            buses.map(([bus, l]) => (
              <div key={bus} className="flex flex-col items-end" title={`Peak ${l.peakPct.toFixed(1)} % · from frame bits, without stuff bits (lower bound)`}>
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">{bus} load</span>
                <span className={`font-semibold ${loadTone(l.loadPct)}`}>{l.loadPct.toFixed(1)}%</span>
              </div>
            ))
          )}
          <div className="h-6 w-px bg-surface-border" />
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Rx rate</span>
            <span className="text-slate-200 font-semibold">
              {p.msgPerSec} <span className="text-[10px] text-slate-400 font-normal">fr/s</span>
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Total</span>
            <span className="text-slate-200 font-semibold">{p.totalRx.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={p.onToggleAttitudeHud}
            className={`p-2 rounded font-mono text-xs flex items-center gap-1.5 border ${
              p.showAttitudeHud ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'bg-surface-elevated text-slate-400 border-surface-border hover:text-slate-200'
            }`}
            title="Lean angle and cornering status"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">HUD</span>
          </button>
          <button
            onClick={p.onTogglePlay}
            disabled={p.source === 'local_file'}
            className={`p-2 rounded font-mono text-xs flex items-center gap-1.5 border disabled:opacity-40 ${
              p.isRunning
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border-emerald-500/40'
            }`}
            title={p.source === 'local_file' ? 'Use the replay controls below' : p.isRunning ? 'Pause the live source' : 'Resume the live source'}
          >
            {p.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{p.isRunning ? 'PAUSE' : 'START'}</span>
          </button>
          <button
            onClick={p.onClear}
            className="p-2 rounded bg-surface-elevated hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-surface-border"
            title="Clear captured data"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
