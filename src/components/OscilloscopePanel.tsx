import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Crosshair, Camera, Download, Calculator, Plus, X } from 'lucide-react';
import { CaptureStore, SeriesPoint } from '../state/captureStore';
import { availableChannels, ChannelInfo } from '../state/channels';
import { didKey, signalKey } from '../services/pipeline';
import {
  MathChannelDef,
  MathOp,
  MATH_OP_LABEL,
  computeMathChannel,
  exportOscilloscopeCsv,
  captureBrandedSnapshot,
  CsvExportChannel,
} from '../services/mathChannels';
import { formatValue } from '../services/format';

interface OscilloscopePanelProps {
  store: CaptureStore;
}

const PALETTE = ['#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#38bdf8', '#fb923c', '#84cc16'];
const DEFAULT_KEYS = [signalKey('VehicleEngine', 'ENGINE_SPEED'), signalKey('VehicleSpeed', 'VEHICLE_SPEED'), signalKey('EkfLean', 'LEAN_ANGLE')];

interface Trace {
  key: string;
  label: string;
  unit: string;
  color: string;
  points: SeriesPoint[];
  dashed: boolean;
}

/** Value of a series at time t (last sample at or before t). */
function valueAt(points: SeriesPoint[], t: number): number | undefined {
  let lo = 0;
  let hi = points.length - 1;
  if (hi < 0 || points[0].time > t) return undefined;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return points[lo].value;
}

export const OscilloscopePanel: React.FC<OscilloscopePanelProps> = ({ store }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timeWindowSec, setTimeWindowSec] = useState<number>(10);
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<'A' | 'B'>('A');
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_KEYS);
  const [picker, setPicker] = useState<string>('');
  const [mathChannels, setMathChannels] = useState<MathChannelDef[]>([]);
  const [showMath, setShowMath] = useState(false);
  const [draft, setDraft] = useState<{ op: MathOp; a: string; b: string; scale: string; unit: string }>({
    op: 'derivative',
    a: signalKey('EkfLean', 'LEAN_ANGLE'),
    b: didKey('VEHICLE_SPEED'),
    scale: '1',
    unit: 'deg/s',
  });

  const channels = availableChannels(store);
  const channelByKey = useMemo(() => new Map(channels.map((c) => [c.key, c])), [channels]);
  const colorOf = (i: number) => PALETTE[i % PALETTE.length];

  const traces: Trace[] = [
    ...enabled.map((key, i) => {
      const info = channelByKey.get(key);
      return { key, label: info?.label ?? key, unit: info?.unit ?? '', color: colorOf(i), points: store.history.get(key) ?? [], dashed: false };
    }),
    ...mathChannels
      .filter((m) => m.enabled)
      .map((m) => ({ key: m.id, label: `[math] ${m.label}`, unit: m.unit, color: m.color, points: computeMathChannel(m, store.history), dashed: true })),
  ];

  let latestTime = 0;
  traces.forEach((t) => {
    const last = t.points[t.points.length - 1];
    if (last && last.time > latestTime) latestTime = last.time;
  });
  if (latestTime === 0) latestTime = store.lastTime;
  const startTime = Math.max(0, latestTime - timeWindowSec);
  const cursorTime = (frac: number) => startTime + frac * timeWindowSec;

  // Render (React re-renders at most once per animation frame via the store).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 1; i < 10; i++) {
      const x = (width / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const pad = 14 * dpr;
    traces.forEach((tr) => {
      const visible = tr.points.filter((p) => p.time >= startTime && p.time <= latestTime);
      if (visible.length < 2) return;
      // Auto-scale each trace to its visible range (the legend shows the values).
      let lo = Infinity;
      let hi = -Infinity;
      visible.forEach((p) => {
        if (p.value < lo) lo = p.value;
        if (p.value > hi) hi = p.value;
      });
      if (hi - lo < 1e-9) {
        hi += 1;
        lo -= 1;
      }
      ctx.setLineDash(tr.dashed ? [6 * dpr, 3 * dpr] : []);
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      visible.forEach((p, idx) => {
        const x = ((p.time - startTime) / timeWindowSec) * width;
        const y = height - pad - ((p.value - lo) / (hi - lo)) * (height - 2 * pad);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);

    const drawCursor = (frac: number, color: string, label: string, row: number) => {
      ctx.strokeStyle = color;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(frac * width, 0);
      ctx.lineTo(frac * width, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `${10 * dpr}px monospace`;
      ctx.fillText(label, frac * width + 4 * dpr, 14 * dpr * row);
    };
    if (cursorA !== null) drawCursor(cursorA, '#f59e0b', 'A', 1);
    if (cursorB !== null) drawCursor(cursorB, '#06b6d4', 'B', 2);
  });

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (nextCursor === 'A') {
      setCursorA(frac);
      setNextCursor('B');
    } else {
      setCursorB(frac);
      setNextCursor('A');
    }
  };

  const handleExportCsv = () => {
    const data: CsvExportChannel[] = traces.map((t) => ({ name: t.key, label: t.label, unit: t.unit, data: t.points }));
    if (data.length === 0) return;
    const blob = new Blob([exportOscilloscopeCsv(data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moto-analyzer-scope-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSnapshotPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = captureBrandedSnapshot(canvas, {
      activeChannelsCount: traces.length,
      timeWindowSec,
      platformName: 'Honda CL250',
      footer: `defs ${store.defs.ref} · ${traces.map((t) => t.label).join(', ')}`,
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `moto-analyzer-scope-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
  };

  const addMath = () => {
    const scale = Number(draft.scale);
    if (!Number.isFinite(scale) || !draft.a) return;
    const id = `math_${Date.now()}`;
    const la = channelByKey.get(draft.a)?.label ?? draft.a;
    const lb = channelByKey.get(draft.b)?.label ?? draft.b;
    const label = MATH_OP_LABEL[draft.op].replace('A', la).replace('B', lb) + (scale !== 1 ? ` ×${scale}` : '');
    setMathChannels((prev) => [
      ...prev,
      { id, label, op: draft.op, a: draft.a, b: draft.op === 'derivative' ? undefined : draft.b, scale, unit: draft.unit, color: '#ec4899', enabled: true },
    ]);
  };

  const groups = useMemo(() => {
    const g = new Map<string, ChannelInfo[]>();
    channels.forEach((c) => g.set(c.group, [...(g.get(c.group) ?? []), c]));
    return [...g.entries()];
  }, [channels]);

  const ChannelSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-background border border-surface-border rounded px-2 py-1 text-xs text-slate-200 max-w-[260px]">
      {groups.map(([g, list]) => (
        <optgroup key={g} label={g}>
          {list.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {traces.map((t) => {
            const last = t.points[t.points.length - 1];
            const isMath = t.key.startsWith('math_');
            return (
              <span key={t.key} className="flex items-center gap-1.5 px-2 py-1 rounded border bg-surface-elevated text-slate-100" style={{ borderColor: t.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                <span>{t.label}</span>
                <strong style={{ color: t.color }}>{last ? formatValue(last.value) : '–'}</strong>
                <span className="text-[10px] text-slate-400">{t.unit}</span>
                <button
                  onClick={() =>
                    isMath ? setMathChannels((prev) => prev.filter((m) => m.id !== t.key)) : setEnabled((prev) => prev.filter((k) => k !== t.key))
                  }
                  className="text-slate-500 hover:text-rose-300"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          <span className="flex items-center gap-1">
            <ChannelSelect value={picker || channels[0]?.key || ''} onChange={setPicker} />
            <button
              onClick={() => {
                const key = picker || channels[0]?.key;
                if (key && !enabled.includes(key)) setEnabled((prev) => [...prev, key]);
              }}
              className="p-1 rounded border border-surface-border bg-surface-elevated text-emerald-300 hover:border-emerald-500"
              title="Add channel"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </span>
          <button
            onClick={() => setShowMath((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border ${
              showMath ? 'bg-pink-950/40 border-pink-500/60 text-pink-300' : 'bg-surface-elevated text-slate-400 border-surface-border hover:text-slate-200'
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-pink-400" />
            <span>Math</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-background border border-surface-border rounded p-0.5">
            {[5, 10, 30, 60].map((w) => (
              <button key={w} onClick={() => setTimeWindowSec(w)} className={`px-2 py-0.5 rounded text-xs ${timeWindowSec === w ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400'}`}>
                {w}s
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setCursorA(null);
              setCursorB(null);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border text-xs"
          >
            <Crosshair className="w-3 h-3" />
            <span>Cursors off</span>
          </button>
          <button onClick={handleExportCsv} className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated text-emerald-300 border border-emerald-500/40 text-xs">
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button onClick={handleSnapshotPng} className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated text-cyan-300 border border-cyan-500/40 text-xs">
            <Camera className="w-3.5 h-3.5" />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {showMath && (
        <div className="bg-surface-elevated/60 border-b border-surface-border px-4 py-2 flex flex-wrap items-center gap-2">
          <span className="text-pink-400 font-semibold">Host math channel</span>
          <select value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as MathOp })} className="bg-background border border-surface-border rounded px-2 py-1 text-xs text-slate-200">
            {(Object.keys(MATH_OP_LABEL) as MathOp[]).map((op) => (
              <option key={op} value={op}>
                {MATH_OP_LABEL[op]}
              </option>
            ))}
          </select>
          <span className="text-slate-400">A</span>
          <ChannelSelect value={draft.a} onChange={(a) => setDraft({ ...draft, a })} />
          {draft.op !== 'derivative' && (
            <>
              <span className="text-slate-400">B</span>
              <ChannelSelect value={draft.b} onChange={(b) => setDraft({ ...draft, b })} />
            </>
          )}
          <span className="text-slate-400">× scale</span>
          <input value={draft.scale} onChange={(e) => setDraft({ ...draft, scale: e.target.value })} className="bg-background border border-surface-border rounded px-2 py-1 w-16 text-slate-200" />
          <span className="text-slate-400">unit</span>
          <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className="bg-background border border-surface-border rounded px-2 py-1 w-20 text-slate-200" />
          <button onClick={addMath} className="px-2.5 py-1 rounded bg-pink-500/20 text-pink-200 border border-pink-500/50">
            Add
          </button>
          <span className="text-[10px] text-slate-500">Analysis only — not a platform signal (derived signals live in moto-vehicle-defs).</span>
        </div>
      )}

      <div className="flex-1 relative p-2 overflow-hidden flex flex-col">
        <canvas ref={canvasRef} onClick={handleCanvasClick} className="w-full h-full rounded border border-surface-border cursor-crosshair" />
        <div className="absolute bottom-3 left-4 text-[10px] text-slate-500">
          {startTime.toFixed(2)} s — {latestTime.toFixed(2)} s · each trace auto-scaled to its visible range · click to place cursors
        </div>

        {(cursorA !== null || cursorB !== null) && (
          <div className="absolute top-4 right-4 bg-surface/95 border border-surface-border rounded p-3 text-[11px] flex flex-col gap-1 shadow-lg min-w-[300px]">
            <div className="font-semibold text-slate-200 border-b border-surface-border pb-1 grid grid-cols-4 gap-2">
              <span>Cursor</span>
              <span className="text-amber-400 text-right">A</span>
              <span className="text-cyan-400 text-right">B</span>
              <span className="text-emerald-400 text-right">B − A</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <span className="text-slate-400">t (s)</span>
              <span className="text-right">{cursorA !== null ? cursorTime(cursorA).toFixed(3) : '–'}</span>
              <span className="text-right">{cursorB !== null ? cursorTime(cursorB).toFixed(3) : '–'}</span>
              <span className="text-right">{cursorA !== null && cursorB !== null ? `${((cursorB - cursorA) * timeWindowSec * 1000).toFixed(1)} ms` : '–'}</span>
            </div>
            {traces.map((t) => {
              const va = cursorA !== null ? valueAt(t.points, cursorTime(cursorA)) : undefined;
              const vb = cursorB !== null ? valueAt(t.points, cursorTime(cursorB)) : undefined;
              return (
                <div key={t.key} className="grid grid-cols-4 gap-2">
                  <span className="truncate" style={{ color: t.color }} title={t.label}>
                    {t.label}
                  </span>
                  <span className="text-right">{formatValue(va)}</span>
                  <span className="text-right">{formatValue(vb)}</span>
                  <span className="text-right">{va !== undefined && vb !== undefined ? formatValue(vb - va) : '–'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
