import React from 'react';
import { HeartPulse, Info, ShieldCheck, Activity, CircleDot } from 'lucide-react';
import { CaptureStore } from '../state/captureStore';
import { evaluateWindow, WindowState } from '../services/windows';
import { isE2EValid } from '../services/e2e';
import { formatSignal, formatValue } from '../services/format';
import { frameKey } from '../services/capture';

interface HealthPanelProps {
  store: CaptureStore;
}

const holdTone = (h: boolean | null) => (h === null ? 'text-slate-500' : h ? 'text-emerald-300' : 'text-slate-400');
const holdText = (h: boolean | null) => (h === null ? 'n/a' : h ? 'holds' : 'no');

const WindowCard: React.FC<{ s: WindowState }> = ({ s }) => {
  const w = s.def;
  const isCondition = w.opensOn === 'condition';
  const eventOnly = w.conditions.length === 0 && w.stable.length === 0;
  const badge = eventOnly
    ? { text: `EVENT: ${w.opensOn.toUpperCase()}`, tone: 'bg-slate-900 text-slate-400 border-slate-700' }
    : isCondition && s.qualified
    ? { text: 'ENTRY MET', tone: 'bg-emerald-950/50 text-emerald-300 border-emerald-700' }
    : s.conditionsHold === true
    ? { text: isCondition ? `HOLDING ${s.heldForSec.toFixed(1)} s` : `HOLDS · NEEDS ${w.opensOn.toUpperCase()}`, tone: 'bg-amber-950/40 text-amber-300 border-amber-700' }
    : s.conditionsHold === null
    ? { text: 'NOT OBSERVABLE', tone: 'bg-slate-900 text-slate-400 border-slate-700' }
    : { text: 'NOT MET', tone: 'bg-slate-900 text-slate-400 border-slate-700' };

  return (
    <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2 border-b border-surface-border pb-2">
        <div>
          <div className="font-bold text-slate-100">{w.key}</div>
          <div className="text-[10px] text-slate-400">
            {w.record}
            {w.recordDid !== undefined && ` · 0x${w.recordDid.toString(16).toUpperCase()}`}
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold whitespace-nowrap ${badge.tone}`}>{badge.text}</span>
      </div>
      <p className="text-[11px] text-slate-300 leading-relaxed">{w.description}</p>
      <div className="text-[10px] text-slate-400">
        opens on <span className="text-cyan-300">{w.opensOn}</span> · {w.minDurationMs / 1000}–{w.maxDurationMs / 1000} s
      </div>

      <div className="flex flex-col gap-1 text-[11px]">
        {s.conditions.length === 0 && <span className="text-slate-500">No condition: opened by the {w.opensOn} event alone.</span>}
        {s.conditions.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-baseline">
            <span className="text-slate-300 truncate" title={c.input.note}>
              {c.text}
              {c.input.note && <span className="text-[9px] text-slate-500"> ({c.input.note})</span>}
            </span>
            <span className="text-cyan-200">{formatValue(c.value)}</span>
            <span className={`${holdTone(c.holds)} w-12 text-right`}>{holdText(c.holds)}</span>
          </div>
        ))}
        {s.stable.map((st, i) => (
          <div key={`s${i}`} className="grid grid-cols-[1fr_auto_auto] gap-2 items-baseline">
            <span className="text-slate-300 truncate">
              {st.input.label} spread ≤ {st.maxSpread} over {w.minDurationMs / 1000} s
            </span>
            <span className="text-cyan-200">{formatValue(st.spread)}</span>
            <span className={`${holdTone(st.holds)} w-12 text-right`}>{holdText(st.holds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HealthPanel: React.FC<HealthPanelProps> = ({ store }) => {
  const defs = store.defs;
  const now = store.lastTime;
  const windows = defs.windows.map((w) => evaluateWindow(defs, w, store.history, now));
  const e2e = store.pipeline.getE2EStats();
  const heartbeats = store.pipeline
    .catalog('platform')
    .filter((m) => m.signals.some((s) => s.name === 'NODE_MODE'))
    .map((m) => ({ msg: m, frame: store.framesByKey.get(frameKey('platform', m.id)) }));

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none overflow-auto p-4 gap-4">
      <div className="bg-surface/80 border border-surface-border rounded-lg p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-rose-400" />
          <span className="font-bold text-base text-slate-100">D-079 health windows W1–W5</span>
          <span className="text-[10px] bg-amber-950/40 text-amber-300 px-2 py-0.5 rounded border border-amber-800">provisional values</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed flex gap-2">
          <Info className="w-4 h-4 shrink-0 text-cyan-400" />
          Window records are computed on rt-core and read as ride-summary DIDs. This page shows each window's entry condition from
          derived/cl250_derived.yaml against the inputs the analyzer can observe; it does not compute the records.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {windows.map((s) => (
          <WindowCard key={s.def.key} s={s} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200 border-b border-surface-border pb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> E2E supervisor (platform bus)
          </div>
          {e2e.length === 0 ? (
            <span className="text-slate-500">No E2E-protected message seen.</span>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-400 text-[10px]">
                <tr>
                  <th className="py-1">MESSAGE</th>
                  <th className="py-1">STATUS</th>
                  <th className="py-1 text-right">OK</th>
                  <th className="py-1 text-right">CRC</th>
                  <th className="py-1 text-right">SEQ</th>
                  <th className="py-1 text-right">REP</th>
                  <th className="py-1 text-right">TIMEOUT</th>
                </tr>
              </thead>
              <tbody>
                {e2e.map((m) => (
                  <tr key={m.id} className="border-t border-surface-border/40">
                    <td className="py-1 text-slate-200">
                      0x{m.id.toString(16).toUpperCase().padStart(3, '0')} {m.name}
                    </td>
                    <td className={`py-1 ${isE2EValid(m.status) ? 'text-emerald-300' : 'text-rose-300'}`}>{m.status}</td>
                    <td className="py-1 text-right text-slate-300">{m.counts.OK ?? 0}</td>
                    <td className="py-1 text-right text-rose-300">{m.counts.WRONG_CRC ?? 0}</td>
                    <td className="py-1 text-right text-rose-300">{m.counts.WRONG_SEQUENCE ?? 0}</td>
                    <td className="py-1 text-right text-amber-300">{m.counts.REPEATED ?? 0}</td>
                    <td className="py-1 text-right text-amber-300">{m.counts.NO_NEW_DATA ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <span className="text-[10px] text-slate-500">CRC-8/SAE-J1850 over DataID + payload, counter step 1, timeout 3 × cycle time (docs/e2e-profile.md).</span>
        </div>

        <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200 border-b border-surface-border pb-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Node heartbeats and bus load
          </div>
          {heartbeats.map(({ msg, frame }) => {
            const sig = (n: string) => msg.signals.find((s) => s.name === n);
            const v = frame?.decodedSignals ?? {};
            const ageMs = frame ? (now - frame.timestamp) * 1000 : null;
            const late = ageMs !== null && msg.cycleTimeMs ? ageMs > 3 * msg.cycleTimeMs : true;
            return (
              <div key={msg.id} className="grid grid-cols-[150px_1fr_auto] gap-2 text-[11px] items-center">
                <span className="text-slate-200 flex items-center gap-1.5">
                  <CircleDot className={`w-3 h-3 ${!frame || late ? 'text-rose-400' : 'text-emerald-400'}`} />
                  {msg.name.replace('Heartbeat', '')}
                </span>
                <span className="text-slate-400">
                  {frame ? (
                    <>
                      mode <span className="text-cyan-200">{formatSignal(sig('NODE_MODE'), v.NODE_MODE)}</span> · errors{' '}
                      <span className="text-cyan-200">{formatValue(v.ERROR_COUNT)}</span> · uptime <span className="text-cyan-200">{formatValue(v.UPTIME)} s</span>
                    </>
                  ) : (
                    'not seen'
                  )}
                </span>
                <span className={`text-right ${late ? 'text-rose-300' : 'text-slate-500'}`}>{ageMs !== null ? `${ageMs.toFixed(0)} ms` : ''}</span>
              </div>
            );
          })}
          <div className="border-t border-surface-border pt-2 flex flex-wrap gap-4 text-[11px]">
            {[...store.busLoad.entries()].map(([bus, l]) => (
              <span key={bus} className="text-slate-400">
                {bus}: <span className="text-cyan-200">{l.loadPct.toFixed(1)} %</span> (peak {l.peakPct.toFixed(1)} %, {l.framesPerSec.toFixed(0)} fr/s)
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
