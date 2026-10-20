import React, { useState } from 'react';
import { Eye, RefreshCw, Info } from 'lucide-react';
import { ByteSnifferRecord, ByteActivityStatus } from '../types/can';

interface SnifferPanelProps {
  snifferMap: Map<number, ByteSnifferRecord>;
  onToggleNotch: (id: number, byteIdx: number) => void;
  onClearNotches: () => void;
}

export const SnifferPanel: React.FC<SnifferPanelProps> = ({
  snifferMap,
  onToggleNotch,
  onClearNotches,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const records = Array.from(snifferMap.values()).sort((a, b) => a.id - b.id);
  const selectedRecord = selectedId !== null ? snifferMap.get(selectedId) : records[0];

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

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Sniffer Top Bar */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">SavvyCAN Byte Sniffer</span>
            <span className="text-[10px] text-slate-400 bg-surface-elevated px-1.5 py-0.5 rounded border border-surface-border">Heatmap Mode</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
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
              <span className="text-slate-400">Fluctuating</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
              <span className="text-slate-400">Static</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Main Split Layout: Table on Top/Left, Bit Inspector on Bottom/Right */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Heatmap Matrix Table */}
        <div className="flex-1 overflow-auto border-r border-surface-border">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface sticky top-0 border-b border-surface-border text-slate-400 text-[11px] font-semibold">
              <tr>
                <th className="py-2 px-3 w-20">ID</th>
                <th className="py-2 px-3 w-40">NAME</th>
                <th className="py-2 px-3 text-center" colSpan={8}>
                  DATA BYTES (B0 - B7) — CLICK BYTE TO NOTCH / SUPPRESS
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
                    key={rec.id}
                    onClick={() => setSelectedId(rec.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedRecord?.id === rec.id
                        ? 'bg-cyan-950/30 border-l-2 border-cyan-400'
                        : 'hover:bg-surface-elevated/40'
                    }`}
                  >
                    <td className="py-2 px-3 font-bold text-cyan-400">{rec.idHex}</td>
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
                              onToggleNotch(rec.id, bIdx);
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
                          setSelectedId(rec.id);
                        }}
                        className="p-1 rounded bg-surface hover:bg-surface-elevated text-slate-400 hover:text-cyan-300 border border-surface-border"
                        title="Inspect 64-bit Layout"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 64-bit Bit Inspector Drawer */}
        <div className="w-full md:w-80 bg-surface/60 p-4 flex flex-col gap-4 overflow-auto">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-200">Bit Inspector</span>
            </div>
            {selectedRecord && (
              <span className="font-bold text-cyan-400">{selectedRecord.idHex}</span>
            )}
          </div>

          {selectedRecord ? (
            <div className="flex flex-col gap-3">
              <div className="bg-background border border-surface-border rounded p-2.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Message</div>
                <div className="font-semibold text-slate-200 text-sm">{selectedRecord.name || 'Unknown'}</div>
                <div className="text-slate-400 text-[11px] mt-1">DLC: {selectedRecord.dlc} bytes</div>
              </div>

              {/* Bit Breakdown per Byte */}
              <div className="flex flex-col gap-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">64-Bit Binary Stream</div>
                {selectedRecord.currentBytes.map((byte, bIdx) => (
                  <div key={bIdx} className="bg-background border border-surface-border rounded p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-semibold">Byte {bIdx} (0x{byte.toString(16).toUpperCase().padStart(2, '0')})</span>
                      <span className="text-cyan-400 font-semibold">{byte} dec</span>
                    </div>
                    {/* 8 bits visual */}
                    <div className="grid grid-cols-8 gap-1 text-center font-mono text-[10px]">
                      {Array.from({ length: 8 }).map((_, bitIdx) => {
                        const isSet = (byte & (1 << (7 - bitIdx))) !== 0;
                        return (
                          <div
                            key={bitIdx}
                            className={`py-1 rounded border ${
                              isSet
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                                : 'bg-slate-900/60 text-slate-600 border-surface-border'
                            }`}
                          >
                            {isSet ? '1' : '0'}
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
              Select a CAN ID from the table to inspect individual bits.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
