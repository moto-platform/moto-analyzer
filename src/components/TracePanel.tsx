import React, { useState, useMemo } from 'react';
import { Search, Layers, List, Download, ArrowUpDown, ShieldAlert } from 'lucide-react';
import { CanFrame, TraceMode } from '../types/can';
import { exportToVectorAsc, exportToCsv, exportToJson, downloadFile } from '../services/exportService';

interface TracePanelProps {
  framesMap: Map<number, CanFrame>; // For Overwrite mode
  framesLog: CanFrame[]; // For Scroll mode
  onTriggerPause?: () => void;
}

type SortField = 'id' | 'name' | 'period' | 'freq' | 'count';

export const TracePanel: React.FC<TracePanelProps> = ({ framesMap, framesLog, onTriggerPause }) => {
  const [mode, setMode] = useState<TraceMode>('overwrite');
  const [filterQuery, setFilterQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortAsc, setSortAsc] = useState(true);

  // Trigger setup
  const [triggerId, setTriggerId] = useState<string>('');
  const [isTriggerActive, setIsTriggerActive] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Check if incoming frame satisfies trigger
  useMemo(() => {
    if (!isTriggerActive || !triggerId || !onTriggerPause) return;
    const parsedId = parseInt(triggerId, 16);
    if (!isNaN(parsedId) && framesMap.has(parsedId)) {
      onTriggerPause();
      setIsTriggerActive(false); // Trip trigger once
    }
  }, [framesMap, isTriggerActive, triggerId, onTriggerPause]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filter and Sort frames for Overwrite Mode
  const overwriteFrames = useMemo(() => {
    let list = Array.from(framesMap.values());

    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.idHex.toLowerCase().includes(q) ||
          (f.name && f.name.toLowerCase().includes(q)) ||
          f.data.some((b) => b.toString(16).padStart(2, '0').includes(q))
      );
    }

    return list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = a.id - b.id;
          break;
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'period':
          comparison = a.periodMs - b.periodMs;
          break;
        case 'freq':
          comparison = a.frequencyHz - b.frequencyHz;
          break;
        case 'count':
          comparison = a.count - b.count;
          break;
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [framesMap, filterQuery, sortField, sortAsc]);

  // Filter frames for Scroll Mode
  const scrollFrames = useMemo(() => {
    if (!filterQuery) return framesLog.slice(-150);

    const q = filterQuery.toLowerCase();
    return framesLog.filter(
      (f) =>
        f.idHex.toLowerCase().includes(q) ||
        (f.name && f.name.toLowerCase().includes(q)) ||
        f.data.some((b) => b.toString(16).padStart(2, '0').includes(q))
    ).slice(-150);
  }, [framesLog, filterQuery]);

  const handleExport = (format: 'asc' | 'csv' | 'json') => {
    const list = Array.from(framesMap.values());
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'asc') {
      const content = exportToVectorAsc(framesLog.length > 0 ? framesLog : list);
      downloadFile(content, `can_trace_${timestamp}.asc`, 'text/plain');
    } else if (format === 'csv') {
      const content = exportToCsv(framesLog.length > 0 ? framesLog : list);
      downloadFile(content, `can_trace_${timestamp}.csv`, 'text/csv');
    } else if (format === 'json') {
      const content = exportToJson(framesLog.length > 0 ? framesLog : list);
      downloadFile(content, `can_trace_${timestamp}.json`, 'application/json');
    }
    setShowExportMenu(false);
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Trace Control Toolbar */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-background border border-surface-border rounded p-0.5">
            <button
              onClick={() => setMode('overwrite')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                mode === 'overwrite'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Matrix Overwrite Mode (CANalyzer Grouped)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Overwrite</span>
            </button>
            <button
              onClick={() => setMode('scroll')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                mode === 'scroll'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Chronological Scroll Log"
            >
              <List className="w-3.5 h-3.5" />
              <span>Scroll Log</span>
            </button>
          </div>

          {/* Quick Filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter by ID (0x020), Name, or Hex..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="bg-background border border-surface-border rounded pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-56"
            />
          </div>

          {/* Pause on Trigger Input */}
          <div className="flex items-center gap-1 bg-background border border-surface-border rounded px-2 py-0.5 text-xs">
            <ShieldAlert className={`w-3.5 h-3.5 ${isTriggerActive ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-[10px] text-slate-400">Trigger ID:</span>
            <input
              type="text"
              placeholder="0x081"
              value={triggerId}
              onChange={(e) => setTriggerId(e.target.value)}
              className="bg-transparent text-cyan-300 font-mono w-14 focus:outline-none text-[11px]"
            />
            <button
              onClick={() => setIsTriggerActive(!isTriggerActive)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                isTriggerActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-surface text-slate-400 border-surface-border hover:text-slate-200'
              }`}
            >
              {isTriggerActive ? 'ARMED' : 'ARM'}
            </button>
          </div>
        </div>

        {/* Export & AutoScroll Controls */}
        <div className="flex items-center gap-3 text-slate-400">
          <span>Active IDs: <strong className="text-cyan-400">{framesMap.size}</strong></span>

          {mode === 'scroll' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-slate-700 bg-surface text-cyan-500 focus:ring-0"
              />
              <span>Auto Scroll</span>
            </label>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-slate-200 border border-surface-border text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-surface border border-surface-border rounded-lg shadow-xl py-1 z-30 flex flex-col font-mono text-xs">
                <button
                  onClick={() => handleExport('asc')}
                  className="px-3 py-1.5 text-left text-slate-300 hover:bg-surface-elevated hover:text-cyan-400 transition-colors flex items-center justify-between"
                >
                  <span>Vector ASC (.asc)</span>
                  <span className="text-[10px] text-slate-500">CANoe</span>
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="px-3 py-1.5 text-left text-slate-300 hover:bg-surface-elevated hover:text-cyan-400 transition-colors flex items-center justify-between"
                >
                  <span>Standard CSV (.csv)</span>
                  <span className="text-[10px] text-slate-500">Excel</span>
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="px-3 py-1.5 text-left text-slate-300 hover:bg-surface-elevated hover:text-cyan-400 transition-colors flex items-center justify-between"
                >
                  <span>Payload JSON (.json)</span>
                  <span className="text-[10px] text-slate-500">Raw</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto">
        {mode === 'overwrite' ? (
          /* Overwrite Mode Table */
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface sticky top-0 border-b border-surface-border text-slate-400 text-[11px] font-semibold">
              <tr>
                <th className="py-2 px-3 w-16">BUS</th>
                <th
                  onClick={() => handleSort('id')}
                  className="py-2 px-3 w-20 cursor-pointer hover:text-cyan-400 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>ID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="py-2 px-3 w-48 cursor-pointer hover:text-cyan-400 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>NAME</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2 px-3 w-12 text-center">DLC</th>
                <th
                  onClick={() => handleSort('period')}
                  className="py-2 px-3 w-24 text-right cursor-pointer hover:text-cyan-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>PERIOD (ms)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('freq')}
                  className="py-2 px-3 w-20 text-right cursor-pointer hover:text-cyan-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>FREQ</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('count')}
                  className="py-2 px-3 w-20 text-right cursor-pointer hover:text-cyan-400 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>COUNT</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2 px-3 w-72">DATA (HEX)</th>
                <th className="py-2 px-3">DECODED SIGNALS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50 text-[11px]">
              {overwriteFrames.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No CAN messages detected. Click START to begin virtual telemetry streaming.
                  </td>
                </tr>
              ) : (
                overwriteFrames.map((frame) => (
                  <tr key={frame.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-1.5 px-3 text-slate-400">{frame.bus}</td>
                    <td className="py-1.5 px-3 font-bold text-cyan-400">{frame.idHex}</td>
                    <td className="py-1.5 px-3 text-slate-200 font-medium truncate max-w-[180px]">
                      {frame.name || '-'}
                    </td>
                    <td className="py-1.5 px-3 text-center text-slate-400">{frame.dlc}</td>
                    <td className="py-1.5 px-3 text-right text-slate-300">{frame.periodMs.toFixed(1)}</td>
                    <td className="py-1.5 px-3 text-right text-slate-300">
                      {frame.frequencyHz.toFixed(1)} <span className="text-[9px] text-slate-500">Hz</span>
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-400">{frame.count.toLocaleString()}</td>
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-1">
                        {frame.data.map((byte, idx) => (
                          <span
                            key={idx}
                            className={`inline-block w-6 text-center py-0.5 rounded text-[11px] font-mono border ${
                              frame.changedBytes && frame.changedBytes[idx]
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 byte-changed'
                                : 'bg-slate-900/60 text-slate-300 border-surface-border'
                            }`}
                          >
                            {byte.toString(16).toUpperCase().padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-slate-300 truncate max-w-md">
                      {frame.decodedSignals && Object.keys(frame.decodedSignals).length > 0 ? (
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          {Object.entries(frame.decodedSignals).map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 bg-surface-elevated/60 px-1.5 py-0.5 rounded border border-surface-border text-[10px]"
                            >
                              <span className="text-slate-400">{k}:</span>
                              <strong className="text-cyan-300">{v}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600 italic">Raw frame</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          /* Chronological Scroll Mode Table */
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface sticky top-0 border-b border-surface-border text-slate-400 text-[11px] font-semibold">
              <tr>
                <th className="py-2 px-3 w-24">TIME (s)</th>
                <th className="py-2 px-3 w-16 text-right">Δt (ms)</th>
                <th className="py-2 px-3 w-16">BUS</th>
                <th className="py-2 px-3 w-20">ID</th>
                <th className="py-2 px-3 w-36">NAME</th>
                <th className="py-2 px-3 w-12 text-center">DLC</th>
                <th className="py-2 px-3 w-72">DATA (HEX)</th>
                <th className="py-2 px-3">DECODED</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50 text-[11px]">
              {scrollFrames.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No frames captured yet. Click START to begin recording.
                  </td>
                </tr>
              ) : (
                scrollFrames.map((frame, idx) => (
                  <tr key={idx} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-1 px-3 text-slate-400 font-mono">{frame.timestamp.toFixed(3)}</td>
                    <td className="py-1 px-3 text-right text-slate-500 font-mono">{frame.deltaMs.toFixed(1)}</td>
                    <td className="py-1 px-3 text-slate-400">{frame.bus}</td>
                    <td className="py-1 px-3 font-bold text-cyan-400">{frame.idHex}</td>
                    <td className="py-1 px-3 text-slate-200 font-medium truncate max-w-[150px]">
                      {frame.name || '-'}
                    </td>
                    <td className="py-1 px-3 text-center text-slate-400">{frame.dlc}</td>
                    <td className="py-1 px-3">
                      <div className="flex items-center gap-1 font-mono">
                        {frame.data.map((byte, bIdx) => (
                          <span key={bIdx} className="text-slate-300">
                            {byte.toString(16).toUpperCase().padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-1 px-3 text-slate-300 truncate max-w-sm text-[10px]">
                      {frame.decodedSignals && Object.keys(frame.decodedSignals).length > 0 ? (
                        <span className="text-cyan-300">
                          {Object.entries(frame.decodedSignals).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
