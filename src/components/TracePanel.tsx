import React, { useLayoutEffect, useRef, useState } from 'react';
import { Search, Layers, List, Download, ArrowUpDown, ShieldAlert } from 'lucide-react';
import { CanFrame, TraceMode } from '../types/can';
import { CaptureStore } from '../state/captureStore';
import { formatSignal } from '../services/format';
import { isE2EValid } from '../services/e2e';
import { exportToVectorAsc, exportToCsv, exportToJson, downloadFile } from '../services/exportService';

interface TracePanelProps {
  store: CaptureStore;
  /** True while a pause trigger is armed. */
  triggerArmed: boolean;
  /** Arms the trigger on a CAN ID (the next frame with it pauses the stream), or disarms it. */
  onArmTrigger: (id: number | null) => void;
}

type SortField = 'id' | 'name' | 'period' | 'freq' | 'count';

/** E2E bookkeeping fields are summarised in the E2E column, not repeated as signals. */
const HIDDEN_SIGNALS = new Set(['E2E_CRC', 'E2E_COUNTER']);

/** Fixed row height of the scroll log (virtualized: only visible rows are rendered). */
const ROW_PX = 22;
const OVERSCAN = 10;

const matches = (f: CanFrame, q: string) =>
  f.idHex.toLowerCase().includes(q) ||
  (f.name?.toLowerCase().includes(q) ?? false) ||
  f.bus.toLowerCase().includes(q) ||
  f.data.map((b) => b.toString(16).padStart(2, '0')).join(' ').includes(q);

const E2EBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span className="text-slate-600">–</span>;
  const ok = isE2EValid(status as never);
  const tone = ok ? 'text-emerald-300 border-emerald-700 bg-emerald-950/40' : status === 'INITIAL' ? 'text-slate-300 border-slate-600' : 'text-rose-300 border-rose-700 bg-rose-950/40';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tone}`}>{status}</span>;
};

export const TracePanel: React.FC<TracePanelProps> = ({ store, triggerArmed, onArmTrigger }) => {
  const [mode, setMode] = useState<TraceMode>('overwrite');
  const [filterQuery, setFilterQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [triggerId, setTriggerId] = useState<string>('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const frames = [...store.framesByKey.values()];
  const q = filterQuery.trim().toLowerCase();

  const toggleTrigger = () => {
    if (triggerArmed) {
      onArmTrigger(null);
      return;
    }
    const parsedId = parseInt(triggerId.trim().replace(/^0x/i, ''), 16);
    if (!isNaN(parsedId)) onArmTrigger(parsedId);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const overwriteFrames = (() => {
    const list = q ? frames.filter((f) => matches(f, q)) : frames;
    return list.sort((a, b) => {
      let c = 0;
      switch (sortField) {
        case 'id':
          c = a.bus.localeCompare(b.bus) || a.id - b.id;
          break;
        case 'name':
          c = (a.name || '').localeCompare(b.name || '');
          break;
        case 'period':
          c = a.periodMs - b.periodMs;
          break;
        case 'freq':
          c = a.frequencyHz - b.frequencyHz;
          break;
        case 'count':
          c = a.count - b.count;
          break;
      }
      return sortAsc ? c : -c;
    });
  })();

  // ---- scroll log virtualization
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [follow, setFollow] = useState(true);
  const log = store.log;
  // Without a filter the ring is indexed directly; with one, the matching indices are collected.
  const filtered: number[] | null = mode === 'scroll' && q ? (() => {
    const idx: number[] = [];
    for (let i = 0; i < log.length; i++) if (matches(log.at(i), q)) idx.push(i);
    return idx;
  })() : null;
  const rowCount = filtered ? filtered.length : log.length;
  const rowAt = (r: number) => log.at(filtered ? filtered[r] : r);
  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
  const last = Math.min(rowCount, Math.ceil((scrollTop + viewportH) / ROW_PX) + OVERSCAN);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || mode !== 'scroll') return;
    setViewportH(el.clientHeight);
    if (follow) {
      el.scrollTop = el.scrollHeight;
      setScrollTop(el.scrollTop);
    }
  });

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_PX * 2;
    if (follow !== atBottom) setFollow(atBottom);
  };

  const handleExport = (format: 'asc' | 'csv' | 'json') => {
    const list = log.length > 0 ? log.toArray() : frames;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'asc') downloadFile(exportToVectorAsc(list), `can_trace_${ts}.asc`, 'text/plain');
    else if (format === 'csv') downloadFile(exportToCsv(list), `can_trace_${ts}.csv`, 'text/csv');
    else downloadFile(exportToJson(list), `can_trace_${ts}.json`, 'application/json');
    setShowExportMenu(false);
  };

  const decodedChips = (f: CanFrame) => {
    const msg = store.pipeline.messageFor(f);
    const entries = Object.entries(f.decodedSignals ?? {}).filter(([k]) => !HIDDEN_SIGNALS.has(k));
    return entries.map(([k, v]) => {
      const sig = msg?.signals.find((s) => s.name === k);
      return { k, text: formatSignal(sig, v), unit: sig?.values ? '' : sig?.unit ?? '' };
    });
  };

  const SortHead: React.FC<{ field: SortField; label: string; className?: string }> = ({ field, label, className }) => (
    <th onClick={() => handleSort(field)} className={`py-2 px-3 cursor-pointer hover:text-cyan-400 ${className ?? ''}`}>
      <div className={`flex items-center gap-1 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        <span>{label}</span>
        <ArrowUpDown className="w-3 h-3" />
      </div>
    </th>
  );

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-background border border-surface-border rounded p-0.5">
            {(['overwrite', 'scroll'] as TraceMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${
                  mode === m ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'overwrite' ? <Layers className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
                <span>{m === 'overwrite' ? 'Overwrite' : 'Scroll log'}</span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter: ID, name, bus or bytes"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="bg-background border border-surface-border rounded pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-56"
            />
          </div>

          <div className="flex items-center gap-1 bg-background border border-surface-border rounded px-2 py-0.5 text-xs">
            <ShieldAlert className={`w-3.5 h-3.5 ${triggerArmed ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-[10px] text-slate-400">Pause on ID</span>
            <input
              type="text"
              placeholder="0x081"
              value={triggerId}
              onChange={(e) => setTriggerId(e.target.value)}
              className="bg-transparent text-cyan-300 font-mono w-20 focus:outline-none text-[11px]"
            />
            <button
              onClick={toggleTrigger}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                triggerArmed ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-surface text-slate-400 border-surface-border hover:text-slate-200'
              }`}
            >
              {triggerArmed ? 'ARMED' : 'ARM'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <span>
            IDs: <strong className="text-cyan-400">{frames.length}</strong>
          </span>
          {mode === 'scroll' && (
            <label className="flex items-center gap-1.5 cursor-pointer" title="Keep the newest frame in view">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              follow · {rowCount.toLocaleString()} / {log.capacity.toLocaleString()} frames
            </label>
          )}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-slate-200 border border-surface-border text-xs"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-surface border border-surface-border rounded-lg shadow-xl py-1 z-30 flex flex-col text-xs">
                {(
                  [
                    ['asc', 'Vector ASC (.asc)'],
                    ['csv', 'CSV (.csv)'],
                    ['json', 'JSON (.json)'],
                  ] as const
                ).map(([fmt, label]) => (
                  <button key={fmt} onClick={() => handleExport(fmt)} className="px-3 py-1.5 text-left text-slate-300 hover:bg-surface-elevated hover:text-cyan-400">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto" ref={scrollRef} onScroll={mode === 'scroll' ? onScroll : undefined}>
        {mode === 'overwrite' ? (
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface sticky top-0 border-b border-surface-border text-slate-400 text-[11px] font-semibold z-10">
              <tr>
                <th className="py-2 px-3 w-20">BUS</th>
                <SortHead field="id" label="ID" className="w-28" />
                <SortHead field="name" label="NAME" className="w-44" />
                <th className="py-2 px-3 w-10 text-center">DLC</th>
                <SortHead field="period" label="PERIOD ms" className="w-24 text-right" />
                <SortHead field="freq" label="Hz" className="w-20 text-right" />
                <SortHead field="count" label="COUNT" className="w-20 text-right" />
                <th className="py-2 px-3 w-28">E2E</th>
                <th className="py-2 px-3 w-72">DATA</th>
                <th className="py-2 px-3">DECODED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50 text-[11px]">
              {overwriteFrames.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    No frames yet.
                  </td>
                </tr>
              ) : (
                overwriteFrames.map((frame) => (
                  <tr key={`${frame.bus}:${frame.id}`} className="hover:bg-surface-elevated/40">
                    <td className="py-1.5 px-3 text-slate-400">{frame.bus}</td>
                    <td className="py-1.5 px-3 font-bold text-cyan-400">{frame.idHex}</td>
                    <td className="py-1.5 px-3 text-slate-200 truncate max-w-[180px]">{frame.name || <span className="text-slate-600">–</span>}</td>
                    <td className="py-1.5 px-3 text-center text-slate-400">{frame.dlc}</td>
                    <td className="py-1.5 px-3 text-right text-slate-300">{frame.periodMs > 0 ? frame.periodMs.toFixed(1) : '–'}</td>
                    <td className="py-1.5 px-3 text-right text-slate-300">{frame.frequencyHz > 0 ? frame.frequencyHz.toFixed(1) : '–'}</td>
                    <td className="py-1.5 px-3 text-right text-slate-400">{frame.count.toLocaleString()}</td>
                    <td className="py-1.5 px-3">
                      <E2EBadge status={frame.e2e} />
                    </td>
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-1">
                        {frame.data.map((byte, idx) => (
                          <span
                            key={idx}
                            className={`inline-block w-6 text-center py-0.5 rounded text-[11px] border ${
                              frame.changedBytes?.[idx] ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-slate-900/60 text-slate-300 border-surface-border'
                            }`}
                          >
                            {byte.toString(16).toUpperCase().padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-slate-300">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {decodedChips(frame).map(({ k, text, unit }) => (
                          <span key={k} className="inline-flex items-center gap-1 bg-surface-elevated/60 px-1.5 py-0.5 rounded border border-surface-border text-[10px]">
                            <span className="text-slate-400">{k}</span>
                            <strong className="text-cyan-300">{text}</strong>
                            {unit && <span className="text-slate-500">{unit}</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface sticky top-0 border-b border-surface-border text-slate-400 text-[11px] font-semibold z-10">
              <tr>
                <th className="py-2 px-3 w-28">TIME s</th>
                <th className="py-2 px-3 w-20 text-right">Δt ms</th>
                <th className="py-2 px-3 w-20">BUS</th>
                <th className="py-2 px-3 w-28">ID</th>
                <th className="py-2 px-3 w-40">NAME</th>
                <th className="py-2 px-3 w-10 text-center">DLC</th>
                <th className="py-2 px-3 w-60">DATA</th>
                <th className="py-2 px-3">DECODED</th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              <tr style={{ height: first * ROW_PX }} />
              {Array.from({ length: Math.max(0, last - first) }, (_, k) => first + k).map((r) => {
                const frame = rowAt(r);
                return (
                <tr key={r} style={{ height: ROW_PX }} className="hover:bg-surface-elevated/40 border-t border-surface-border/40">
                  <td className="py-0 px-3 whitespace-nowrap text-slate-400">{frame.timestamp.toFixed(4)}</td>
                  <td className="py-0 px-3 whitespace-nowrap text-right text-slate-500">{frame.deltaMs.toFixed(2)}</td>
                  <td className="py-0 px-3 whitespace-nowrap text-slate-400">{frame.bus}</td>
                  <td className="py-0 px-3 whitespace-nowrap font-bold text-cyan-400">{frame.idHex}</td>
                  <td className="py-0 px-3 whitespace-nowrap text-slate-200 truncate max-w-[150px]">{frame.name || '–'}</td>
                  <td className="py-0 px-3 whitespace-nowrap text-center text-slate-400">{frame.dlc}</td>
                  <td className="py-0 px-3 whitespace-nowrap text-slate-300">{frame.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}</td>
                  <td className="py-0 px-3 text-cyan-300 truncate max-w-sm text-[10px] whitespace-nowrap">
                    {decodedChips(frame)
                      .map(({ k, text }) => `${k}=${text}`)
                      .join(', ') || <span className="text-slate-600">–</span>}
                  </td>
                </tr>
                );
              })}
              <tr style={{ height: Math.max(0, rowCount - last) * ROW_PX }} />
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
