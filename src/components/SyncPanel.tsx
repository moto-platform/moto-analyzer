import React, { useRef, useState } from 'react';
import { CanFrame, DbcMessageDef } from '../types/can';
import { CaptureStore } from '../state/captureStore';
import { parseDbcText } from '../services/dbcParser';
import { parseVectorAsc, parseCanCsv } from '../services/logParser';
import { Na, Note, TermButton, Toolbar, cn } from '../ui/primitives';
import { useHotkeys } from '../ui/keys';
import { GutterMark, ListHead, TD, TH } from '../ui/panel-parts';

interface SyncPanelProps {
  store: CaptureStore;
  onLogLoaded: (frames: CanFrame[], filename: string) => void;
}

type Selection = { kind: 'msg'; id: number } | { kind: 'dids' };

const id3 = (id: number) => `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;

export const SyncPanel: React.FC<SyncPanelProps> = ({ store, onLogLoaded }) => {
  const defs = store.defs;
  const catalog = store.pipeline.catalog('platform');
  const [selection, setSelection] = useState<Selection>({ kind: 'msg', id: catalog[0]?.id ?? 0 });
  const [status, setStatus] = useState<string>('');
  const dbcInput = useRef<HTMLInputElement>(null);
  const logInput = useRef<HTMLInputElement>(null);

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

  // j/k walk the list (platform messages, then the UDS DID entry). App owns the GLOBAL_KEYS.
  const move = (delta: number) => {
    const entries: Selection[] = [...catalog.map((m) => ({ kind: 'msg', id: m.id }) as Selection), { kind: 'dids' }];
    const i = entries.findIndex((e) => (e.kind === 'dids' ? selection.kind === 'dids' : selection.kind === 'msg' && selection.id === e.id));
    const next = entries[Math.max(0, Math.min(entries.length - 1, (i < 0 ? 0 : i) + delta))];
    if (next) setSelection(next);
  };
  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    b: () => dbcInput.current?.click(),
    r: () => store.customPlatformDbc && resetDefs(),
    g: () => logInput.current?.click(),
  });

  const rowClass = (on: boolean) => cn('flex w-full items-baseline gap-[1ch] whitespace-nowrap px-[6px] py-[3px] text-left border-b border-term-rule', on ? 'bg-term-row' : 'hover:bg-term-row');

  return (
    <div className="flex h-full select-none flex-col bg-term-bg">
      <Toolbar>
        <span>
          <span className="font-semibold text-term-hi">moto-vehicle-defs {defs.ref}</span>{' '}
          <span className="text-term-dim">
            platform.dbc{defs.platform.version && ` (VERSION "${defs.platform.version}")`} · cl250.dbc · uds/vehicle_cl250.yaml
          </span>
        </span>
        <span className="ml-auto">
          {store.customPlatformDbc ? (
            <span className="text-term-amber">! custom DBC: {store.customPlatformDbc}</span>
          ) : (
            <span className="text-term-dim">decoding from the pinned defs only</span>
          )}
        </span>
      </Toolbar>

      {status && <div className="shrink-0 border-b border-term-rule px-[14px] leading-[24px] text-term-fg">{status}</div>}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav aria-label="Definitions" className="flex w-[330px] shrink-0 flex-col overflow-y-auto border-r border-term-rule bg-term-raise">
          <ListHead aside={`${catalog.length} messages`}>platform bus</ListHead>
          {catalog.map((msg) => {
            const on = selectedMsg?.id === msg.id;
            return (
              <button key={msg.id} type="button" onClick={() => setSelection({ kind: 'msg', id: msg.id })} className={rowClass(on)} aria-current={on}>
                <GutterMark cursor={on} />
                <span className="w-[5ch] text-term-hi">{id3(msg.id)}</span>
                <span className={cn('min-w-0 flex-1 truncate', on ? 'text-term-hi' : 'text-term-fg')}>{msg.name}</span>
                <span className="text-term-faint">
                  {msg.cycleTimeMs ? `${msg.cycleTimeMs} ms` : 'event'}
                  {msg.e2e ? ' e2e' : ''}
                </span>
              </button>
            );
          })}

          <ListHead className="mt-3">vehicle bus</ListHead>
          <div className="border-b border-term-rule px-[14px] py-[3px] text-term-dim">
            cl250.dbc: {defs.vehicleDbc.messages.length} broadcast messages (skeleton until Q-001). ECU data comes by UDS polling.
          </div>
          <button type="button" onClick={() => setSelection({ kind: 'dids' })} className={rowClass(selection.kind === 'dids')} aria-current={selection.kind === 'dids'}>
            <GutterMark cursor={selection.kind === 'dids'} />
            <span className={cn('flex-1', selection.kind === 'dids' ? 'text-term-hi' : 'text-term-fg')}>UDS DIDs</span>
            <span className="text-term-faint">
              {defs.vehicle.dids.length} polled, {defs.vehicle.dids.filter((d) => d.verified).length} verified
            </span>
          </button>

          <ListHead className="mt-3">analyse with another DBC</ListHead>
          <div className="flex flex-col items-start px-[8px] py-[6px]">
            <TermButton hotkey="B" onClick={() => dbcInput.current?.click()}>
              load .dbc for the platform bus
            </TermButton>
            <TermButton hotkey="R" onClick={resetDefs} disabled={!store.customPlatformDbc}>
              back to defs {defs.ref}
            </TermButton>
            <input ref={dbcInput} type="file" accept=".dbc" onChange={handleDbcUpload} className="hidden" tabIndex={-1} />
          </div>

          <ListHead>replay a log</ListHead>
          <div className="flex flex-col items-start px-[8px] py-[6px]">
            <TermButton hotkey="G" onClick={() => logInput.current?.click()}>
              load .asc or .csv
            </TermButton>
            <input ref={logInput} type="file" accept=".asc,.csv" onChange={handleLogUpload} className="hidden" tabIndex={-1} />
            <Note className="mt-1 px-[8px] text-term-faint">ASC channel 1 = vehicle bus, 2 = platform bus (moto-server convention).</Note>
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-auto">
          {selection.kind === 'dids' ? (
            <>
              <div className="px-[14px] pb-2 pt-[10px]">
                <span className="font-semibold text-term-hi">UDS DIDs</span>{' '}
                <span className="text-term-dim">
                  uds/vehicle_cl250.yaml · {defs.identification.length} identification DIDs in uds/obd_catalog.yaml
                </span>
              </div>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-term-bg">
                  <tr>
                    <th className={cn(TH, 'pl-[14px]')}>did</th>
                    <th className={TH}>name</th>
                    <th className={cn(TH, 'text-right')}>bytes</th>
                    <th className={TH}>scaling</th>
                    <th className={TH}>unit</th>
                    <th className={cn(TH, 'text-right')}>poll ms</th>
                    <th className={cn(TH, 'text-right')}>stale ms</th>
                    <th className={TH}>republished as</th>
                    <th className={TH}>verified</th>
                  </tr>
                </thead>
                <tbody>
                  {defs.vehicle.dids.map((d) => (
                    <tr key={d.did}>
                      <td className={cn(TD, 'pl-[14px] text-term-hi')}>0x{d.did.toString(16).toUpperCase()}</td>
                      <td className={TD} title={d.description}>
                        {d.name}
                      </td>
                      <td className={cn(TD, 'text-right')}>{d.length}</td>
                      <td className={cn(TD, 'text-term-dim')}>
                        × {d.factorNum}/{d.factorDen} {d.offset !== 0 ? `${d.offset > 0 ? '+' : ''}${d.offset}` : ''}
                      </td>
                      <td className={cn(TD, 'text-term-faint')}>{d.unit || <Na />}</td>
                      <td className={cn(TD, 'text-right')}>{d.pollPeriodMs}</td>
                      <td className={cn(TD, 'text-right')}>{d.staleAfterMs}</td>
                      <td className={cn(TD, 'text-term-dim')}>{d.platformSignal ?? <Na />}</td>
                      <td className={TD}>{d.verified ? <span className="text-term-dim">yes</span> : <span className="text-term-amber">! no</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : selectedMsg ? (
            <>
              <div className="border-b border-term-rule px-[14px] pb-2 pt-[10px]">
                <div>
                  <span className="font-semibold text-term-hi">{selectedMsg.name}</span> <span className="text-term-hi">{id3(selectedMsg.id)}</span>
                </div>
                <div className="text-term-dim">
                  sender {selectedMsg.sender} · dlc {selectedMsg.dlc} · {selectedMsg.cycleTimeMs ? `cycle ${selectedMsg.cycleTimeMs} ms` : 'no cycle time'}
                  {selectedMsg.e2e && ` · E2E DataID 0x${selectedMsg.e2e.dataId.toString(16).toUpperCase()}`}
                </div>
                {selectedMsg.comment && <p className="mt-1 max-w-[110ch] text-term-dim">{selectedMsg.comment}</p>}
              </div>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-term-bg">
                  <tr>
                    <th className={cn(TH, 'pl-[14px]')}>signal</th>
                    <th className={cn(TH, 'text-right')}>start</th>
                    <th className={cn(TH, 'text-right')}>len</th>
                    <th className={TH}>order</th>
                    <th className={cn(TH, 'text-right')}>factor</th>
                    <th className={cn(TH, 'text-right')}>offset</th>
                    <th className={cn(TH, 'text-right')}>range</th>
                    <th className={TH}>unit</th>
                    <th className={TH}>values / receivers</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMsg.signals.map((sig) => (
                    <tr key={sig.name}>
                      <td className={cn(TD, 'pl-[14px] text-term-fg')} title={sig.comment}>
                        {sig.name}
                      </td>
                      <td className={cn(TD, 'text-right')}>{sig.startBit}</td>
                      <td className={cn(TD, 'text-right')}>{sig.bitLength}</td>
                      <td className={cn(TD, 'text-term-dim')}>
                        {sig.isLittleEndian ? 'Intel' : 'Motorola'}
                        {sig.isSigned ? ' signed' : ''}
                      </td>
                      <td className={cn(TD, 'text-right')}>{sig.factor}</td>
                      <td className={cn(TD, 'text-right')}>{sig.offset}</td>
                      <td className={cn(TD, 'text-right text-term-dim')}>
                        [{sig.min} | {sig.max}]
                      </td>
                      <td className={cn(TD, 'text-term-faint')}>{sig.unit || <Na />}</td>
                      <td className={cn(TD, 'whitespace-normal text-term-dim')}>
                        {sig.values
                          ? Object.entries(sig.values)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(' · ')
                          : sig.receivers?.join(', ') || <Na />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="px-[14px] py-6 text-term-faint">Select a message.</div>
          )}
        </div>
      </div>
    </div>
  );
};
