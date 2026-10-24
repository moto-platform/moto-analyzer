import React from 'react';
import { CaptureStore } from '../state/captureStore';
import { Readout, ReadoutState, clusterInput, evaluateCluster } from '../services/cluster';
import { Note, Pane, Status, TextMeter, cn } from '../ui/primitives';

interface ClusterPanelProps {
  store: CaptureStore;
  /** Source seconds per wall second since the newest frame: 1 live, the replay speed, 0 paused. */
  clockRate: number;
}

/** Label for every state that replaces the number. */
const STATE_LABEL: Record<Exclude<ReadoutState, 'ok'>, string> = {
  no_data: 'no data',
  stale: 'STALE',
  invalid: 'INVALID',
  not_in_defs: 'not in defs',
};

/** State tag: stale amber `!`, invalid and not-in-defs red `■`, no data faint. Nothing for ok. */
const StateTag: React.FC<{ r: Readout }> = ({ r }) => {
  if (r.state === 'ok') return null;
  const level = r.state === 'stale' ? 'warn' : r.state === 'no_data' ? 'na' : 'fault';
  return (
    <Status level={level} title={r.note}>
      {STATE_LABEL[r.state]}
    </Status>
  );
};

/** Value text, dimmed when it is not a current valid value; empty states show the tag only. */
const Value: React.FC<{ r: Readout; className?: string }> = ({ r, className }) => {
  const current = r.state === 'ok';
  const hasLast = r.text !== '' && (r.state === 'stale' || r.state === 'invalid');
  return (
    <span className={cn('whitespace-nowrap', className)}>
      {(current || hasLast) && (
        <span className={current ? 'text-term-hi' : 'text-term-faint line-through'} title={current ? undefined : 'last value, not current'}>
          {r.text}
          {r.unit && <small className="ml-[3px] text-term-faint">{r.unit}</small>}
        </span>
      )}
      {!current && <span className={hasLast ? 'ml-2' : ''}><StateTag r={r} /></span>}
    </span>
  );
};

/** Percent position of a value inside its DBC range, or null when it cannot be placed. */
function pctOf(r: Readout): number | null {
  if (r.state !== 'ok' || r.value === null || r.min === null || r.max === null || r.max <= r.min) return null;
  return ((r.value - r.min) / (r.max - r.min)) * 100;
}

/* Tachometer geometry: 240 degree sweep, open at the bottom. */
const CX = 110;
const CY = 110;
const R = 90;
const START = -120;
const SWEEP = 240;
const DIVISIONS = 8;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
};
const arc = (from: number, to: number, r: number) => {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
};

/** Arc scale over the DBC range of the signal; the needle is drawn only for a current valid value. */
const Tach: React.FC<{ r: Readout }> = ({ r }) => {
  const pct = pctOf(r);
  const angle = pct === null ? null : START + (Math.max(0, Math.min(100, pct)) / 100) * SWEEP;
  const needle = angle === null ? null : polar(angle, R - 8);
  const ticks = Array.from({ length: DIVISIONS + 1 }, (_, i) => i / DIVISIONS);
  const known = r.min !== null && r.max !== null;
  return (
    <svg width="220" height="190" viewBox="0 0 220 190" role="img" aria-label={pct === null ? 'Engine speed not available' : `Engine speed ${r.text} ${r.unit}`}>
      <path d={arc(START, START + SWEEP, R)} fill="none" className="stroke-term-ruleHi" />
      {pct !== null && <path d={arc(START, angle!, R - 4)} fill="none" className="stroke-term-fg" strokeWidth="3" />}
      <g className="stroke-term-faint">
        {ticks.map((f, i) => {
          const d = START + f * SWEEP;
          const p = polar(d, R);
          const q = polar(d, R + 6);
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
        })}
      </g>
      {known && (
        <g className="fill-term-faint" fontSize="10" textAnchor="middle" fontFamily="inherit">
          {ticks.map((f, i) => {
            const p = polar(START + f * SWEEP, R + 17);
            return (
              <text key={i} x={p.x} y={p.y + 3}>
                {Math.round(r.min! + f * (r.max! - r.min!))}
              </text>
            );
          })}
        </g>
      )}
      {needle && (
        <>
          <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} className="stroke-term-hi" strokeWidth="1.5" />
          <rect x={CX - 2} y={CY - 2} width="4" height="4" className="fill-term-hi" />
        </>
      )}
      <text x={CX} y={CY + 42} textAnchor="middle" fontFamily="inherit" fontSize="26" className={r.state === 'ok' ? 'fill-term-hi' : 'fill-term-faint'}>
        {r.state === 'ok' ? r.text : '–'}
      </text>
      <text x={CX} y={CY + 58} textAnchor="middle" fontFamily="inherit" fontSize="11" className="fill-term-dim">
        {r.unit || ' '}
      </text>
    </svg>
  );
};

/** Bar gauge over the DBC range with its value (or state) on the right. */
const Bar: React.FC<{ r: Readout }> = ({ r }) => {
  const pct = pctOf(r);
  const range = r.min !== null && r.max !== null ? `${formatEnd(r.min)}..${formatEnd(r.max)} ${r.unit}` : '';
  return (
    <div className="grid grid-cols-[9ch_auto_1fr] items-center gap-x-3" title={`${r.spec.message}.${r.spec.signal} (${r.source}) ${range}`}>
      <span className="text-term-dim">{r.spec.label}</span>
      <TextMeter pct={pct} cells={24} className="[&>span:last-child]:hidden" />
      <span className="text-right">
        <Value r={r} />
      </span>
    </div>
  );
};
const formatEnd = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Telltale: label dim, value-table name coloured by the partition's own level or by data state. */
const Telltale: React.FC<{ r: Readout; level?: 'ok' | 'warn' | 'fault' | 'na' }> = ({ r, level }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-term-rule py-[3px]" title={`${r.spec.message}.${r.spec.signal} (${r.source})`}>
    <span className="text-term-dim">{r.spec.label}</span>
    {r.state === 'ok' ? <Status level={level ?? 'ok'}>{r.text}</Status> : <StateTag r={r} />}
  </div>
);

/** Cornering level as the safety partition sent it; without a fresh frame UNAVAILABLE, never green. */
function corneringLevel(r: Readout): 'ok' | 'warn' | 'fault' | 'na' {
  if (r.state !== 'ok') return 'na';
  if (r.text === 'GREEN') return 'ok';
  if (r.text === 'YELLOW') return 'warn';
  if (r.text === 'RED') return 'fault';
  return 'na';
}

/** Node lamp: `●` with the NODE_MODE name; a missing, stale or invalid heartbeat is faint or flagged. */
const Lamp: React.FC<{ r: Readout }> = ({ r }) => {
  const ok = r.state === 'ok';
  return (
    <div className="flex items-center gap-2" title={`${r.spec.message}.${r.spec.signal}`}>
      <span aria-hidden="true" className={ok ? 'text-term-fg' : r.state === 'stale' ? 'text-term-amber' : r.state === 'no_data' ? 'text-term-faint' : 'text-term-red'}>
        {ok ? '●' : '○'}
      </span>
      <span className="w-[8ch] text-term-dim">{r.spec.label}</span>
      {ok ? <span>{r.text}</span> : <StateTag r={r} />}
    </div>
  );
};

/**
 * Instrument cluster view. Everything shown is a platform signal (or the vehicle DID
 * that rt-core republishes into it when the platform frame is missing); the scales are
 * the DBC ranges, the only colours are the safety partition's own cornering level and
 * data states. Read-only: nothing here transmits.
 */
export const ClusterPanel: React.FC<ClusterPanelProps> = ({ store, clockRate }) => {
  const c = evaluateCluster(clusterInput(store, clockRate));
  const lean = c.lean;
  const leanSide = lean.state === 'ok' && lean.value !== null ? (lean.value > 0 ? ', right' : lean.value < 0 ? ', left' : '') : '';
  const leanAbs = lean.state === 'ok' && lean.value !== null ? Math.abs(lean.value).toFixed(1) : null;
  const leanSign = lean.state === 'ok' && lean.value !== null ? (lean.value > 0 ? '+' : lean.value < 0 ? '−' : '') : '';
  const speed = c.speed;

  return (
    <div className="h-full select-none overflow-y-auto">
      <div className="grid grid-cols-1 xl:grid-cols-2">
        <Pane title="Engine & speed" aside="VehicleEngine + VehicleSpeed" className="xl:border-r">
          <div className="grid grid-cols-[220px_1fr] items-center gap-x-6">
            <Tach r={c.rpm} />
            <div>
              <div className="text-term-dim">speed</div>
              <div className="text-big tracking-[-.02em]">
                {speed.state === 'ok' ? (
                  <>
                    <span className="text-term-hi">{speed.text}</span>
                    <small className="ml-1 text-[18px] text-term-dim">{speed.unit}</small>
                  </>
                ) : (
                  <span className="text-[22px]">
                    <Value r={speed} />
                  </span>
                )}
              </div>
              <div className="mt-1 text-term-dim">
                source {speed.source}
                {c.speedAge.state === 'ok' && speed.state === 'ok' && (
                  <span className="text-term-faint">
                    {' '}
                    · age {c.speedAge.text} {c.speedAge.unit}
                  </span>
                )}
              </div>
              <div className="mt-2 text-term-dim">
                rpm <Value r={c.rpm} />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <Bar r={c.coolant} />
            <Bar r={c.battery} />
            <Bar r={c.throttle} />
          </div>
          <Note>Scales are the DBC ranges. A stale or invalid value is struck through and labelled, never shown as current.</Note>
        </Pane>

        <Pane title="Lean & warnings" aside="EkfLean + SafetyWarningStatus">
          <div className="mb-3">
            <div className="text-term-dim">lean{leanSide}</div>
            {leanAbs !== null ? (
              <div className="text-big tracking-[-.02em] text-term-hi">
                <span className="text-term-dim">{leanSign}</span>
                {leanAbs}
                <small className="ml-[2px] text-[22px] text-term-dim">{lean.unit}</small>
              </div>
            ) : (
              <div className="text-[22px] leading-[36px]">
                <Value r={lean} />
              </div>
            )}
            <div className="text-term-dim">
              state <Value r={c.leanState} className="text-term-fg" /> · quality <Value r={c.leanQuality} className="text-term-fg" />
            </div>
          </div>
          <div className="mb-3">
            <Telltale r={c.cornering} level={corneringLevel(c.cornering)} />
            <Telltale r={c.corneringSource} />
            <Telltale r={c.bsmLeft} />
            <Telltale r={c.bsmRight} />
            <Telltale r={c.immobilizer} />
            <Telltale r={c.ecu} />
          </div>
          <Note>Cornering level comes from the safety partition; the analyzer does not compute it. Without a fresh, E2E-valid frame it shows no data, never green.</Note>
        </Pane>
      </div>

      <Pane title="Nodes" aside="Heartbeat* NODE_MODE">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
          <Lamp r={c.hbRtCore} />
          <Lamp r={c.hbSafety} />
          <Lamp r={c.hbConn} />
          <Lamp r={c.hbLinux} />
        </div>
      </Pane>
    </div>
  );
};
