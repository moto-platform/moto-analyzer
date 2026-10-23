import React, { useState } from 'react';
import { Upload, RefreshCw, FolderSync, FileSpreadsheet, ShieldCheck, AlertTriangle } from 'lucide-react';
import { CanFrame, DbcMessageDef } from '../types/can';
import { CaptureStore } from '../state/captureStore';
import { parseDbcText } from '../services/dbcParser';
import { parseVectorAsc, parseCanCsv } from '../services/logParser';

interface SyncPanelProps {
  store: CaptureStore;
  onLogLoaded: (frames: CanFrame[], filename: string) => void;
}

type Selection = { kind: 'msg'; id: number } | { kind: 'dids' };

export const SyncPanel: React.FC<SyncPanelProps> = ({ store, onLogLoaded }) => {
  const defs = store.defs;
  const catalog = store.pipeline.catalog('platform');
  const [selection, setSelection] = useState<Selection>({ kind: 'msg', id: catalog[0]?.id ?? 0 });
  const [status, setStatus] = useState<string>('');

  const selectedMsg: DbcMessageDef | undefined = selection.kind === 'msg' ? catalog.find((m) => m.id === selection.id) : undefined;

  const readFile = (file: File, cb: (text: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => cb(String(e.target?.result ?? ''));
    reader.readAsText(file);
  };

  const handleDbcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readFile(file, (text) => {
      const parsed = parseDbcText(text);
      if (parsed.length === 0) {
        setStatus(`${file.name} defines no messages (BO_); the active catalog is unchanged.`);
        return;
      }
      store.setPlatformCatalog(parsed, file.name);
      setSelection({ kind: 'msg', id: parsed[0].id });
      setStatus(`Decoding the platform bus with ${file.name} (${parsed.length} messages). This is not moto-vehicle-defs.`);
    });
  };

  const resetDefs = () => {
    store.setPlatformCatalog(defs.platform.messages, null);
    setSelection({ kind: 'msg', id: defs.platform.messages[0]?.id ?? 0 });
    setStatus(`Back to platform.dbc of defs ${defs.ref}.`);
  };

  const handleLogUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    readFile(file, (text) => {
      const frames = file.name.toLowerCase().endsWith('.asc') ? parseVectorAsc(text) : parseCanCsv(text);
      if (frames.length === 0) {
        setStatus(`No CAN frame could be read from ${file.name}.`);
        return;
      }
      frames.sort((a, b) => a.timestamp - b.timestamp);
      onLogLoaded(frames, file.name);
      setStatus(`Loaded ${frames.length.toLocaleString()} frames from ${file.name} for replay.`);
    });
  };

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderSync className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">moto-vehicle-defs {defs.ref}</span>
          <span className="text-[10px] text-slate-400">platform.dbc{defs.platform.version && ` (VERSION "${defs.platform.version}")`} · cl250.dbc · uds/vehicle_cl250.yaml</span>
        </div>
        {store.customPlatformDbc ? (
          <span className="flex items-center gap-1.5 text-amber-300 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5" /> custom DBC active: {store.customPlatformDbc}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-emerald-300 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" /> decoding from the pinned defs only
          </span>
        )}
      </div>

      {status && <div className="px-4 py-1.5 border-b border-surface-border text-[11px] text-slate-300 bg-surface/40">{status}</div>}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="w-full md:w-80 border-r border-surface-border p-3 flex flex-col gap-3 overflow-auto">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Platform bus ({catalog.length} messages)</div>
          {catalog.map((msg) => (
            <button
              key={msg.id}
              onClick={() => setSelection({ kind: 'msg', id: msg.id })}
              className={`text-left p-2 rounded border ${
                selectedMsg?.id === msg.id ? 'bg-cyan-950/30 border-cyan-500/50' : 'bg-surface/50 border-surface-border hover:bg-surface-elevated'
              }`}
            >
              <div className="flex justify-between">
                <span className="font-bold text-cyan-400">0x{msg.id.toString(16).toUpperCase().padStart(3, '0')}</span>
                <span className="text-[10px] text-slate-500">{msg.sender}</span>
              </div>
              <div className="text-slate-200 truncate">{msg.name}</div>
              <div className="text-[10px] text-slate-400">
                {msg.cycleTimeMs ? `${msg.cycleTimeMs} ms` : 'event'} · {msg.signals.length} signals{msg.e2e ? ' · E2E' : ''}
              </div>
            </button>
          ))}

          <div className="text-[10px] text-slate-400 uppercase font-semibold mt-2">Vehicle bus</div>
          <div className="p-2 rounded border border-surface-border text-[11px] text-slate-400">
            cl250.dbc: {defs.vehicleDbc.messages.length} broadcast messages (skeleton until Q-001). ECU data comes by UDS polling.
          </div>
          <button
            onClick={() => setSelection({ kind: 'dids' })}
            className={`text-left p-2 rounded border ${selection.kind === 'dids' ? 'bg-cyan-950/30 border-cyan-500/50' : 'bg-surface/50 border-surface-border hover:bg-surface-elevated'}`}
          >
            <div className="text-slate-200">UDS DIDs</div>
            <div className="text-[10px] text-slate-400">
              {defs.vehicle.dids.length} polled ({defs.vehicle.dids.filter((d) => d.verified).length} verified) · {defs.identification.length} identification
            </div>
          </button>

          <div className="mt-2 pt-3 border-t border-surface-border flex flex-col gap-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Analyse with another DBC</span>
            <label className="flex items-center justify-center gap-2 p-2 border-2 border-dashed border-surface-border hover:border-amber-500/50 rounded cursor-pointer">
              <Upload className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300 text-[11px]">Load .dbc for the platform bus</span>
              <input type="file" accept=".dbc" onChange={handleDbcUpload} className="hidden" />
            </label>
            <button
              onClick={resetDefs}
              disabled={!store.customPlatformDbc}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-elevated text-slate-300 border border-surface-border disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Back to defs {defs.ref}
            </button>
          </div>

          <div className="pt-3 border-t border-surface-border flex flex-col gap-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Replay a log</span>
            <label className="flex items-center justify-center gap-2 p-2 border-2 border-dashed border-surface-border hover:border-cyan-500/50 rounded cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300 text-[11px]">Load .asc or .csv</span>
              <input type="file" accept=".asc,.csv" onChange={handleLogUpload} className="hidden" />
            </label>
            <span className="text-[10px] text-slate-500">ASC channel 1 = vehicle bus, 2 = platform bus (moto-server convention).</span>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-auto">
          {selection.kind === 'dids' ? (
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-400 text-[10px] sticky top-0 bg-background">
                <tr>
                  <th className="py-1.5 pr-2">DID</th>
                  <th className="py-1.5 pr-2">NAME</th>
                  <th className="py-1.5 pr-2 text-right">BYTES</th>
                  <th className="py-1.5 pr-2">SCALING</th>
                  <th className="py-1.5 pr-2">UNIT</th>
                  <th className="py-1.5 pr-2 text-right">POLL ms</th>
                  <th className="py-1.5 pr-2 text-right">STALE ms</th>
                  <th className="py-1.5 pr-2">REPUBLISHED AS</th>
                  <th className="py-1.5">VERIFIED</th>
                </tr>
              </thead>
              <tbody>
                {defs.vehicle.dids.map((d) => (
                  <tr key={d.did} className="border-t border-surface-border/40">
                    <td className="py-1 pr-2 text-cyan-400">0x{d.did.toString(16).toUpperCase()}</td>
                    <td className="py-1 pr-2 text-slate-200" title={d.description}>
                      {d.name}
                    </td>
                    <td className="py-1 pr-2 text-right text-slate-400">{d.length}</td>
                    <td className="py-1 pr-2 text-slate-400">
                      × {d.factorNum}/{d.factorDen} {d.offset !== 0 ? `${d.offset > 0 ? '+' : ''}${d.offset}` : ''}
                    </td>
                    <td className="py-1 pr-2 text-slate-400">{d.unit}</td>
                    <td className="py-1 pr-2 text-right text-slate-400">{d.pollPeriodMs}</td>
                    <td className="py-1 pr-2 text-right text-slate-400">{d.staleAfterMs}</td>
                    <td className="py-1 pr-2 text-slate-400">{d.platformSignal ?? '–'}</td>
                    <td className={`py-1 ${d.verified ? 'text-emerald-300' : 'text-amber-300'}`}>{d.verified ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : selectedMsg ? (
            <div className="flex flex-col gap-3">
              <div className="bg-surface/60 border border-surface-border rounded p-3 flex flex-col gap-1">
                <div className="text-base font-bold text-slate-100">
                  {selectedMsg.name} <span className="text-xs font-normal text-cyan-400">0x{selectedMsg.id.toString(16).toUpperCase().padStart(3, '0')}</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  sender {selectedMsg.sender} · DLC {selectedMsg.dlc} · {selectedMsg.cycleTimeMs ? `cycle ${selectedMsg.cycleTimeMs} ms` : 'no cycle time'}
                  {selectedMsg.e2e && ` · E2E DataID 0x${selectedMsg.e2e.dataId.toString(16).toUpperCase()}`}
                </div>
                {selectedMsg.comment && <p className="text-[11px] text-slate-300 leading-relaxed mt-1">{selectedMsg.comment}</p>}
              </div>
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-400 text-[10px]">
                  <tr>
                    <th className="py-1.5 pr-2">SIGNAL</th>
                    <th className="py-1.5 pr-2 text-center">START</th>
                    <th className="py-1.5 pr-2 text-center">LEN</th>
                    <th className="py-1.5 pr-2">ORDER</th>
                    <th className="py-1.5 pr-2 text-right">FACTOR</th>
                    <th className="py-1.5 pr-2 text-right">OFFSET</th>
                    <th className="py-1.5 pr-2 text-right">RANGE</th>
                    <th className="py-1.5 pr-2">UNIT</th>
                    <th className="py-1.5">VALUES / RECEIVERS</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMsg.signals.map((sig) => (
                    <tr key={sig.name} className="border-t border-surface-border/40 align-top">
                      <td className="py-1 pr-2 text-cyan-300 font-semibold" title={sig.comment}>
                        {sig.name}
                      </td>
                      <td className="py-1 pr-2 text-center text-slate-300">{sig.startBit}</td>
                      <td className="py-1 pr-2 text-center text-slate-300">{sig.bitLength}</td>
                      <td className="py-1 pr-2 text-slate-400">
                        {sig.isLittleEndian ? 'Intel' : 'Motorola'} {sig.isSigned ? 'signed' : ''}
                      </td>
                      <td className="py-1 pr-2 text-right text-slate-300">{sig.factor}</td>
                      <td className="py-1 pr-2 text-right text-slate-300">{sig.offset}</td>
                      <td className="py-1 pr-2 text-right text-slate-400">
                        [{sig.min} | {sig.max}]
                      </td>
                      <td className="py-1 pr-2 text-amber-400">{sig.unit || '–'}</td>
                      <td className="py-1 text-slate-400">
                        {sig.values
                          ? Object.entries(sig.values)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(' · ')
                          : sig.receivers?.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-slate-500 py-12 text-center">Select a message.</div>
          )}
        </div>
      </div>
    </div>
  );
};
