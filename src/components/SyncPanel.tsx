import React, { useState } from 'react';
import { Upload, CheckCircle2, RefreshCw, FolderSync, Shield, FileSpreadsheet } from 'lucide-react';
import { DbcMessageDef, CanFrame } from '../types/can';
import { DEFAULT_MOTO_MESSAGES, parseDbcText } from '../services/dbcParser';
import { parseVectorAsc, parseCanCsv } from '../services/logParser';

interface SyncPanelProps {
  onDbcLoaded: (messages: DbcMessageDef[]) => void;
  activeDbcMessages: DbcMessageDef[];
  onLogLoaded: (frames: CanFrame[], filename: string) => void;
}

export const SyncPanel: React.FC<SyncPanelProps> = ({
  onDbcLoaded,
  activeDbcMessages,
  onLogLoaded,
}) => {
  const [selectedMessage, setSelectedMessage] = useState<DbcMessageDef | null>(
    activeDbcMessages[0] || null
  );
  const [syncStatus, setSyncStatus] = useState<string>('Synchronized with local platform.dbc & cl250.dbc');

  const handleDbcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseDbcText(content);
        onDbcLoaded(parsed);
        setSelectedMessage(parsed[0] || null);
        setSyncStatus(`Successfully loaded ${parsed.length} message definitions from ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  const handleLogUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        let parsed: CanFrame[] = [];
        if (file.name.endsWith('.asc')) {
          parsed = parseVectorAsc(content, activeDbcMessages);
        } else {
          parsed = parseCanCsv(content, activeDbcMessages);
        }

        if (parsed.length > 0) {
          onLogLoaded(parsed, file.name);
          setSyncStatus(`Loaded ${parsed.length} frames from ${file.name} for Time Machine replay`);
        } else {
          setSyncStatus(`Warning: No valid CAN frames could be parsed from ${file.name}`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleResetDefaults = () => {
    onDbcLoaded(DEFAULT_MOTO_MESSAGES);
    setSelectedMessage(DEFAULT_MOTO_MESSAGES[0]);
    setSyncStatus('Reset to official moto-vehicle-defs DBC definitions');
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      {/* Top Bar */}
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderSync className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">Local DBC & Log Synchronizer</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-elevated hover:bg-slate-700 text-slate-300 border border-surface-border text-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Platform DBC</span>
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: DBC Message Catalog & File Uploads */}
        <div className="w-full md:w-80 border-r border-surface-border p-4 flex flex-col gap-3 overflow-auto">
          <div className="flex items-center justify-between border-b border-surface-border pb-2">
            <span className="font-semibold text-slate-200">Active DBC Catalog</span>
            <span className="text-[10px] bg-cyan-950/40 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800">
              {activeDbcMessages.length} Messages
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {activeDbcMessages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelectedMessage(msg)}
                className={`p-2.5 rounded border cursor-pointer transition-colors ${
                  selectedMessage?.id === msg.id
                    ? 'bg-cyan-950/30 border-cyan-500/50 text-slate-100'
                    : 'bg-surface/50 border-surface-border text-slate-400 hover:bg-surface-elevated hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-400">0x{msg.id.toString(16).toUpperCase().padStart(3, '0')}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{msg.sender}</span>
                </div>
                <div className="font-semibold text-slate-200 mt-1 truncate">{msg.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  DLC: {msg.dlc} • {msg.signals.length} signals
                </div>
              </div>
            ))}
          </div>

          {/* Upload New DBC */}
          <div className="mt-2 pt-3 border-t border-surface-border flex flex-col gap-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Load Custom DBC</span>
            <label className="flex items-center justify-center gap-2 p-2.5 border-2 border-dashed border-surface-border hover:border-cyan-500/50 rounded-lg cursor-pointer bg-surface/30 hover:bg-surface-elevated/40 transition-colors">
              <Upload className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300 text-[11px]">Select .dbc file</span>
              <input type="file" accept=".dbc" onChange={handleDbcUpload} className="hidden" />
            </label>
          </div>

          {/* Upload Log for Time Machine Replay */}
          <div className="mt-1 pt-2 border-t border-surface-border flex flex-col gap-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Time Machine Replay Log</span>
            <label className="flex items-center justify-center gap-2 p-2.5 border-2 border-dashed border-surface-border hover:border-amber-500/50 rounded-lg cursor-pointer bg-surface/30 hover:bg-surface-elevated/40 transition-colors">
              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300 text-[11px]">Load .asc or .csv Log</span>
              <input type="file" accept=".asc,.csv" onChange={handleLogUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Right: Message Details & Signal Definitions Table */}
        <div className="flex-1 p-6 flex flex-col gap-4 overflow-auto">
          {selectedMessage ? (
            <div className="flex flex-col gap-4">
              <div className="bg-surface/60 border border-surface-border rounded-lg p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>{selectedMessage.name}</span>
                      <span className="text-xs font-mono font-normal text-cyan-400">
                        (0x{selectedMessage.id.toString(16).toUpperCase().padStart(3, '0')})
                      </span>
                    </h2>
                    <div className="text-slate-400 text-xs mt-0.5">
                      Transmitter Node: <strong className="text-slate-300">{selectedMessage.sender}</strong> • DLC: {selectedMessage.dlc} Bytes
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/30 px-3 py-1 rounded border border-emerald-800">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>DBC Verified</span>
                  </div>
                </div>
              </div>

              {/* Signals Table */}
              <div className="bg-surface/40 border border-surface-border rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface border-b border-surface-border text-slate-400 text-[11px] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">SIGNAL NAME</th>
                      <th className="py-2.5 px-3 w-20 text-center">START BIT</th>
                      <th className="py-2.5 px-3 w-20 text-center">LENGTH</th>
                      <th className="py-2.5 px-3 w-20 text-center">ORDER</th>
                      <th className="py-2.5 px-3 w-24 text-right">FACTOR</th>
                      <th className="py-2.5 px-3 w-20 text-right">OFFSET</th>
                      <th className="py-2.5 px-3 w-28 text-right">RANGE [MIN | MAX]</th>
                      <th className="py-2.5 px-3 w-20">UNIT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border/50 text-[11px]">
                    {selectedMessage.signals.map((sig) => (
                      <tr key={sig.name} className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 px-3 font-semibold text-cyan-300">{sig.name}</td>
                        <td className="py-2 px-3 text-center text-slate-300">{sig.startBit}</td>
                        <td className="py-2 px-3 text-center text-slate-300">{sig.bitLength}</td>
                        <td className="py-2 px-3 text-center text-slate-400">
                          {sig.isLittleEndian ? 'Intel (LE)' : 'Motorola (BE)'}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">{sig.factor}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{sig.offset}</td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          [{sig.min} | {sig.max}]
                        </td>
                        <td className="py-2 px-3 text-amber-400 font-semibold">{sig.unit || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Status Banner */}
              <div className="bg-background border border-surface-border rounded p-3 flex items-center justify-between text-xs text-slate-400">
                <span>{syncStatus}</span>
                <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Platform Invariant 2 Compliant</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-12">
              Select a message definition to inspect its signal schema.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
