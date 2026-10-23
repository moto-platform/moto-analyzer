import React from 'react';
import { Compass } from 'lucide-react';
import { CaptureStore } from '../state/captureStore';
import { frameKey } from '../services/capture';
import { formatSignal } from '../services/format';
import { isE2EValid } from '../services/e2e';
import { CanFrame, DbcMessageDef } from '../types/can';

interface AttitudeGaugeProps {
  store: CaptureStore;
}

const LEVEL_STYLE: Record<string, string> = {
  GREEN: 'text-emerald-300 border-emerald-500/60 bg-emerald-950/40',
  YELLOW: 'text-amber-300 border-amber-500/60 bg-amber-950/40',
  RED: 'text-rose-300 border-rose-500/80 bg-rose-950/50 animate-pulse',
  UNAVAILABLE: 'text-slate-400 border-slate-600 bg-slate-900',
};

/** Latest frame of a platform message, if it is fresh (within 3 cycles) and its E2E check passed. */
function usable(store: CaptureStore, msg: DbcMessageDef | undefined): CanFrame | undefined {
  if (!msg) return undefined;
  const f = store.framesByKey.get(frameKey('platform', msg.id));
  if (!f) return undefined;
  if (msg.cycleTimeMs && (store.lastTime - f.timestamp) * 1000 > 3 * msg.cycleTimeMs) return undefined;
  if (msg.e2e && (!f.e2e || !isE2EValid(f.e2e))) return undefined;
  return f;
}

/**
 * Lean angle from rt-core's EKF (EkfLean) and the cornering warning level the safety
 * partition itself decided (SafetyWarningStatus). The colour is the partition's level,
 * never a threshold of the analyzer; a missing, stale or E2E-invalid status shows
 * UNAVAILABLE, never GREEN (platform.dbc comment on message 0x023).
 */
export const AttitudeGauge: React.FC<AttitudeGaugeProps> = ({ store }) => {
  const catalog = store.pipeline.catalog('platform');
  const leanMsg = catalog.find((m) => m.name === 'EkfLean');
  const warnMsg = catalog.find((m) => m.name === 'SafetyWarningStatus');
  const leanFrame = usable(store, leanMsg);
  const warnFrame = usable(store, warnMsg);
  const sig = (m: DbcMessageDef | undefined, n: string) => m?.signals.find((s) => s.name === n);

  const leanState = leanFrame ? formatSignal(sig(leanMsg, 'LEAN_ANGLE_STATE'), leanFrame.decodedSignals?.LEAN_ANGLE_STATE) : 'NO DATA';
  const leanUsable = leanFrame && (leanState === 'ESTIMATED' || leanState === 'CLAMPED');
  const lean = leanUsable ? Number(leanFrame!.decodedSignals?.LEAN_ANGLE ?? 0) : null;
  const quality = leanFrame?.decodedSignals?.LEAN_ANGLE_QUALITY;

  const level = warnFrame ? formatSignal(sig(warnMsg, 'CORNERING_LEVEL'), warnFrame.decodedSignals?.CORNERING_LEVEL) : 'UNAVAILABLE';
  const source = warnFrame ? formatSignal(sig(warnMsg, 'CORNERING_SOURCE'), warnFrame.decodedSignals?.CORNERING_SOURCE) : '–';
  const bsmL = warnFrame ? formatSignal(sig(warnMsg, 'BSM_LEFT'), warnFrame.decodedSignals?.BSM_LEFT) : '–';
  const bsmR = warnFrame ? formatSignal(sig(warnMsg, 'BSM_RIGHT'), warnFrame.decodedSignals?.BSM_RIGHT) : '–';
  const immo = warnFrame ? formatSignal(sig(warnMsg, 'IMMOBILIZER_STATE'), warnFrame.decodedSignals?.IMMOBILIZER_STATE) : '–';
  const levelStyle = LEVEL_STYLE[level] ?? LEVEL_STYLE.UNAVAILABLE;
  const angle = lean ?? 0;

  return (
    <div className="bg-surface/90 border border-surface-border rounded-lg p-3 flex flex-col gap-2 font-mono text-xs select-none shadow-md">
      <div className="flex items-center justify-between border-b border-surface-border pb-1.5">
        <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>Lean & cornering</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${levelStyle}`} title={`source ${source}`}>
          {level}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-24 h-24 flex items-center justify-center bg-background rounded-full border border-surface-border overflow-hidden">
          <div className="absolute w-full h-px bg-slate-700/60" />
          <div className="absolute h-full w-px bg-slate-700/40" />
          <div className="w-14 h-14 transition-transform duration-75 ease-out" style={{ transform: `rotate(${angle}deg)`, opacity: lean === null ? 0.25 : 1 }}>
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="14" fill="#0891b2" />
              <line x1="20" y1="38" x2="80" y2="38" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" />
              <polygon points="50,15 62,38 38,38" fill="#0284c7" />
              <rect x="46" y="55" width="8" height="28" rx="4" fill="#334155" stroke="#0ea5e9" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-400">lean</span>
            <span className="text-slate-100 font-bold text-sm">{lean === null ? '—' : `${lean > 0 ? '+' : ''}${lean.toFixed(1)}°`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">state</span>
            <span className={leanUsable ? 'text-emerald-300' : 'text-amber-300'}>{leanState}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">quality</span>
            <span className="text-cyan-300">{quality !== undefined ? `${quality} %` : '–'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">BSM L / R</span>
            <span className="text-slate-300">
              {bsmL} / {bsmR}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">immobilizer</span>
            <span className="text-slate-300">{immo}</span>
          </div>
        </div>
      </div>
      <div className="text-[9px] text-slate-500">Level from the safety partition (0x023), not computed here.</div>
    </div>
  );
};
