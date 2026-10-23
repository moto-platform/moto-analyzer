import React, { useState } from 'react';
import { Eye, RefreshCw, Info, Waves, LayoutGrid, ArrowRightLeft, Sparkles } from 'lucide-react';
import { ByteActivityStatus } from '../types/can';
import { CaptureStore } from '../state/captureStore';
import { frameKey } from '../services/capture';
import { classifyBit as classifyBitRate, BitClass } from '../services/sniffer';

interface SnifferPanelProps {
  store: CaptureStore;
}

type SnifferViewMode = 'heatmap' | 'flow';

export const SnifferPanel: React.FC<SnifferPanelProps> = ({ store }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<SnifferViewMode>('heatmap');

  const snifferMap = store.sniffer;
  const keyOf = (rec: { id: number; bus: string }) => frameKey(rec.bus, rec.id);
  const records = Array.from(snifferMap.values()).sort((a, b) => a.bus.localeCompare(b.bus) || a.id - b.id);
  const selectedRecord = (selectedKey !== null ? snifferMap.get(selectedKey) : undefined) ?? records[0];
  const onToggleNotch = (key: string, idx: number) => store.toggleNotch(key, idx);
  const onInvertNotch = (key: string) => store.invertNotch(key);
  const onClearNotches = () => store.clearNotches();

  const getStatusColor = (status: ByteActivityStatus, isNotched: boolean) => {
    if (isNotched) return 'bg-slate-800 text-slate-500 opacity-40 line-through';
    switch (status) {
      case 'inc':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case 'dec':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/50';
      case 'toggling':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse';
      case 'static':
      default:
        return 'bg-slate-900/60 text-slate-400 border-surface-border';
    }
  };

  const BIT_CLASS_STYLE: Record<BitClass, string> = {
    STATIC: 'text-slate-600 bg-slate-900/60',
    RARE: 'text-emerald-400 bg-emerald-950/40 border-emerald-700',
    ACTIVE: 'text-amber-400 bg-amber-950/40 border-amber-700',
    FAST: 'text-cyan-300 bg-cyan-950/40 border-cyan-700',
  };
  const classifyBit = (flips: number, frames: number) => {
    const label = classifyBitRate(flips, frames);
    return { label, color: BIT_CLASS_STYLE[label] };
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Sniffer Top Bar */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">SavvyCAN Sniffer & Flow View</span>
            {/* View Mode Toggle */}
            <div className="flex items-center bg-background border border-surface-border rounded p-0.5 ml-2">
              <button
                onClick={() => setViewMode('heatmap')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                  viewMode === 'heatmap'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Heatmap</span>
              </button>
              <button
                onClick={() => setViewMode('flow')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                  viewMode === 'flow'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Waves className="w-3.5 h-3.5" />
                <span>Flow Waterfall</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] hidden lg:flex">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-slate-400">Increasing</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-slate-400">Decreasing</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-slate-400">Reversed direction</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <span className="text-slate-400">Static</span>
            </span>
          </div>
        </div>

        {/* Notch & Action Controls */}
        <div className="flex items-center gap-2">
          {selectedRecord && (
            <button
              onClick={() => onInvertNotch(keyOf(selectedRecord))}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-cyan-300 border border-surface-border text-xs transition-colors"
              title="Invert notched bytes for selected ID"
            >
              <ArrowRightLeft className="w-3 h-3" />
              <span>Invert Notch</span>
            </button>
          )}

          <button
            onClick={onClearNotches}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border transition-colors text-xs"
            title="Reset all Notch filters"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset Notches</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Table/Flow on Left, Bit Inspector on Right */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Heatmap Matrix OR Flow View Waterfall */}
        <div className="flex-1 overflow-auto border-r border-surface-border">
          {viewMode === 'heatmap' ? (
            /* Heatmap Matrix Table */
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface sticky top-0 border-b border-surface-border text-slate-400 text-[11px] font-semibold">
                <tr>
                  <th className="py-2 px-3 w-20">ID</th>
                  <th className="py-2 px-3 w-40">NAME</th>
                  <th className="py-2 px-3 text-center" colSpan={8}>
                    DATA BYTES (B0 - B7) — CLICK BYTE TO NOTCH / MUTE
                  </th>
                  <th className="py-2 px-3 w-24 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50 text-[11px]">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500">
                      No CAN activity to sniff. Start telemetry stream to populate byte heatmap.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                    <tr
                      key={keyOf(rec)}
                      onClick={() => setSelectedKey(keyOf(rec))}
                      className={`cursor-pointer transition-colors ${
                        selectedRecord && keyOf(selectedRecord) === keyOf(rec)
                          ? 'bg-cyan-950/30 border-l-2 border-cyan-400'
                          : 'hover:bg-surface-elevated/40'
                      }`}
                    >
                      <td className="py-2 px-3 font-bold text-cyan-400">
                        {rec.idHex}
                        <span className="block text-[9px] font-normal text-slate-500">{rec.bus}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-300 font-medium truncate max-w-[160px]">
                        {rec.name || '-'}
                      </td>
                      {Array.from({ length: 8 }).map((_, bIdx) => {
                        const byteVal = rec.currentBytes[bIdx] ?? 0;
                        const status = rec.byteStatuses[bIdx] ?? 'static';
                        const isNotched = rec.notchedBytes[bIdx] ?? false;

                        return (
                          <td key={bIdx} className="py-2 px-1 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleNotch(keyOf(rec), bIdx);
                              }}
                              className={`w-7 h-6 rounded font-mono text-[11px] border transition-all ${getStatusColor(
                                status,
                                isNotched
                              )}`}
                              title={`Byte ${bIdx}: 0x${byteVal.toString(16).toUpperCase().padStart(2, '0')} (${byteVal})\nChanges: ${rec.changeCounts[bIdx]}\nClick to Toggle Notch Filter`}
                            >
                              {byteVal.toString(16).toUpperCase().padStart(2, '0')}
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKey(keyOf(rec));
                          }}
                          className="p-1 rounded bg-surface hover:bg-surface-elevated text-slate-400 hover:text-cyan-300 border border-surface-border"
                          title="Inspect 64-bit Layout & Waterfall"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* Flow View Waterfall (Sequential Frame Stream of Selected ID) */
            <div className="flex flex-col h-full overflow-auto p-3 gap-2">
              <div className="bg-surface/60 border border-surface-border rounded p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Waves className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-slate-200">
                    Flow Waterfall Stream for {selectedRecord?.idHex} ({selectedRecord?.name || 'Unknown'})
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">Showing last 16 consecutive frames</span>
              </div>

              {selectedRecord && selectedRecord.frameHistory && selectedRecord.frameHistory.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {selectedRecord.frameHistory.map((histFrame, idx) => {
                    const prevHist = idx > 0 ? selectedRecord.frameHistory[idx - 1] : null;

                    return (
                      <div
                        key={idx}
                        className="bg-surface/40 hover:bg-surface-elevated border border-surface-border rounded p-2 flex items-center justify-between font-mono text-xs transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-[10px] w-6">#{idx + 1}</span>
                          <span className="text-slate-400 w-20">{histFrame.timestamp.toFixed(3)}s</span>
                        </div>

                        {/* 8 Bytes with Delta Highlight vs Previous Frame in Waterfall */}
                        <div className="flex items-center gap-1.5">
                          {histFrame.data.map((byte, bIdx) => {
                            const isDifferent = prevHist && prevHist.data[bIdx] !== byte;
                            return (
                              <span
                                key={bIdx}
                                className={`inline-block w-7 text-center py-0.5 rounded text-[11px] font-mono border ${
                                  isDifferent
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold animate-pulse'
                                    : 'bg-slate-900/60 text-slate-400 border-surface-border'
                                }`}
                              >
                                {byte.toString(16).toUpperCase().padStart(2, '0')}
                              </span>
                            );
                          })}
                        </div>

                        <div className="text-[10px] text-slate-500 w-24 text-right">
                          {idx === 0 ? 'Anchor' : `Δ Frame #${idx}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-slate-500 py-16">
                  No frame history recorded yet for this ID.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: 64-Bit Transition & Type Classifier Inspector */}
        <div className="w-full md:w-96 bg-surface/60 p-4 flex flex-col gap-4 overflow-auto">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-200">Bit Transition Matrix</span>
            </div>
            {selectedRecord && (
              <span className="font-bold text-cyan-400">{selectedRecord.idHex}</span>
            )}
          </div>

          {selectedRecord ? (
            <div className="flex flex-col gap-3">
              <div className="bg-background border border-surface-border rounded p-2.5 flex flex-col gap-1">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Target ID</div>
                <div className="font-semibold text-slate-200 text-sm flex items-center justify-between">
                  <span>{selectedRecord.name || 'Unknown'}</span>
                  <span className="text-xs text-cyan-400">{selectedRecord.idHex}</span>
                </div>
                <div className="text-slate-400 text-[11px]">DLC: {selectedRecord.dlc} Bytes</div>
              </div>

              {/* Bit Frequency Classifier Legend */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="p-1 rounded bg-cyan-950/30 border border-cyan-800 text-cyan-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Fast (≥45 % of frames)</span>
                </div>
                <div className="p-1 rounded bg-amber-950/30 border border-amber-800 text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Active (5–45 %)</span>
                </div>
                <div className="p-1 rounded bg-emerald-950/30 border border-emerald-800 text-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Rare (&lt;5 %)</span>
                </div>
                <div className="p-1 rounded bg-slate-900 border border-surface-border text-slate-500 flex items-center gap-1">
                  <span>Static (never)</span>
                </div>
              </div>

              {/* 64-Bit Inspection Blocks */}
              <div className="flex flex-col gap-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Bit Transitions (0 ↔ 1)</div>
                {selectedRecord.currentBytes.map((byte, bIdx) => (
                  <div key={bIdx} className="bg-background border border-surface-border rounded p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-semibold">
                        Byte {bIdx} (0x{byte.toString(16).toUpperCase().padStart(2, '0')})
                      </span>
                      <span className="text-cyan-400 font-semibold">{byte} dec</span>
                    </div>

                    {/* 8 Bits with classification and flip counter badge */}
                    <div className="grid grid-cols-8 gap-1 text-center font-mono text-[10px]">
                      {Array.from({ length: 8 }).map((_, bitIdx) => {
                        const bitPos = 7 - bitIdx;
                        const isSet = (byte & (1 << bitPos)) !== 0;
                        const globalBitIdx = bIdx * 8 + bitIdx;
                        const flips = selectedRecord.bitFlips ? selectedRecord.bitFlips[globalBitIdx] || 0 : 0;
                        const classification = classifyBit(flips, selectedRecord.framesCompared);

                        return (
                          <div
                            key={bitIdx}
                            className={`py-1 rounded border flex flex-col items-center justify-center transition-all ${
                              isSet
                                ? 'border-cyan-500/60 font-bold'
                                : 'border-surface-border'
                            } ${classification.color}`}
                            title={`Bit ${globalBitIdx} (Byte ${bIdx}.${bitPos})\nValue: ${isSet ? 1 : 0}\nTransitions: ${flips}\nType: ${classification.label}`}
                          >
                            <span>{isSet ? '1' : '0'}</span>
                            <span className="text-[8px] opacity-75">{flips > 99 ? '99+' : flips}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-12">
              Select a CAN ID from the table to inspect bit transitions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
