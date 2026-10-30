import React, { useMemo, useState } from 'react';
import { CaptureStore } from '../state/captureStore';
import { DtcEntry, UdsTransaction } from '../services/udsMonitor';
import { Defs } from '../defs/model';
import { decodeDtcExtDataRecords, decodeDtcSnapshotRecords, DtcExtDataKind, DtcSnapshotValue, DtcStop } from '../services/dtcRecords';
import { dtcReportToCsv, dtcReportToJson } from '../services/dtcReport';
import { composeUdsRequest, composerServices } from '../services/udsComposer';
import { downloadFile } from '../services/exportService';
import { formatValue, hexDid, hexId } from '../services/format';
import { KeyValues, Na, Note, Pane, Segmented, TermButton, TermInput, Toolbar, cn } from '../ui/primitives';
import { useHotkeys } from '../ui/keys';
import { Empty, GutterMark, TD, TH } from '../ui/panel-parts';

interface UdsPanelProps {
  store: CaptureStore;
  /** True only when the virtual bus is the running source (the simulated ECU). */
  canTransmit: boolean;
  onTransmit: (payload: number[]) => { ok: boolean; error?: string };
}

type Tab = 'transactions' | 'dids' | 'dtcs' | 'composer';
const TABS: Tab[] = ['transactions', 'dids', 'dtcs', 'composer'];

const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
const hexBytes = (b: number[]) => b.map(hex2).join(' ');

function parseHexBytes(text: string): number[] | null {
  const clean = text.replace(/0x/gi, '').replace(/[\s,]+/g, '');
  if (clean === '') return [];
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.substring(i, i + 2), 16));
  return out;
}

/** Transaction status as text: ok dim, nrc red, pending amber, no response red, suppressed faint. */
const StatusText: React.FC<{ t: UdsTransaction; nrcName: (n: number) => string | undefined }> = ({ t, nrcName }) => {
  switch (t.status) {
    case 'positive':
      return <span className="text-term-dim">ok</span>;
    case 'negative':
      return (
        <span className="text-term-red" title={t.nrc !== undefined ? nrcName(t.nrc) : undefined}>
          nrc{t.nrc !== undefined ? ` 0x${hex2(t.nrc)} ${nrcName(t.nrc) ?? ''}` : ''}
        </span>
      );
    case 'pending':
      return <span className="text-term-amber">…</span>;
    case 'no_response':
      return <span className="text-term-red">no response</span>;
    case 'suppressed':
      return <span className="text-term-faint">suppressed</span>;
  }
};

const STOP_LABEL: Record<DtcStop, string> = {
  unknown_did: 'unknown DID',
  variable_length: 'variable-length DID',
  truncated: 'truncated record',
};

const EXT_KIND_LABEL: Record<DtcExtDataKind, string> = {
  manufacturer: 'manufacturer-specific',
  obd: 'OBD',
  reserved: 'reserved',
};

const DtcRecordCell: React.FC<{ defs: Defs; entry: DtcEntry }> = ({ defs, entry }) => {
  if (!entry.snapshot && !entry.extData) return <Na />;
  return (
    <>
      {entry.snapshot && <DtcSnapshotCard defs={defs} bytes={entry.snapshot} />}
      {entry.extData && <DtcExtDataCard defs={defs} bytes={entry.extData} />}
    </>
  );
};

const DtcValueText: React.FC<{ defs: Defs; value: DtcSnapshotValue }> = ({ defs, value }) => {
  const def = defs.catalogByDid.get(value.did);
  if (value.value !== null && typeof value.value === 'object') {
    return (
      <>
        {Object.entries(value.value).map(([name, fieldValue], i) => {
          const field = def?.fields?.find((f) => f.name === name);
          return (
            <span key={name}>
              {i > 0 && <span className="text-term-faint"> · </span>}
              <span className="text-term-faint">{name}</span>=<span className="text-term-hi">{formatValue(fieldValue)}</span>
              {field?.unit && <span className="text-term-dim"> {field.unit}</span>}
            </span>
          );
        })}
      </>
    );
  }
  return (
    <>
      <span className="text-term-hi">{formatValue(value.value)}</span>
      {def?.unit && <span className="text-term-dim"> {def.unit}</span>}
    </>
  );
};

const DtcSnapshotCard: React.FC<{ defs: Defs; bytes: number[] }> = ({ defs, bytes }) => {
  const decoded = decodeDtcSnapshotRecords(defs, bytes);
  const count = decoded.records.reduce((n, record) => n + record.values.length, 0);
  return (
    <div className="mb-1 border border-term-rule bg-term-raise px-2 py-1">
      <div className="text-term-hi">
        snapshot · {decoded.records.length} record{decoded.records.length === 1 ? '' : 's'} · {count} value{count === 1 ? '' : 's'}
      </div>
      {decoded.records.map((record, i) => (
        <div key={`${record.recordNumber}-${i}`} className="mt-1 border-l border-term-rule pl-2">
          <div className="text-term-faint">
            record {record.recordNumber} ·{' '}
            {record.numberOfIdentifiers === defs.iso.dtcRecordReports.snapshot.undefinedNumberOfIdentifiers
              ? 'identifiers run to the end'
              : `${record.numberOfIdentifiers} identifier${record.numberOfIdentifiers === 1 ? '' : 's'}`}
          </div>
          {record.values.map((value, j) => (
            <div key={`${value.did}-${j}`}>
              <span className="text-term-dim">{value.name}</span> (<span className="text-term-faint">0x{value.did.toString(16).toUpperCase().padStart(4, '0')}</span>) ={' '}
              <DtcValueText defs={defs} value={value} />
              <span className="ml-2 text-term-faint">{hexBytes(value.data)}</span>
            </div>
          ))}
        </div>
      ))}
      {decoded.stop && (
        <div className="mt-1 text-term-amber">
          ■ stopped at {STOP_LABEL[decoded.stop]}
          {decoded.rest.length > 0 && <span className="text-term-faint"> · rest {hexBytes(decoded.rest)}</span>}
        </div>
      )}
      {decoded.records.length === 0 && !decoded.stop && <div className="text-term-faint">no record stored</div>}
      <div className="mt-1 text-term-faint">raw {hexBytes(bytes)}</div>
    </div>
  );
};

const DtcExtDataCard: React.FC<{ defs: Defs; bytes: number[] }> = ({ defs, bytes }) => {
  const decoded = decodeDtcExtDataRecords(defs, bytes);
  return (
    <div className="mb-1 border border-term-rule bg-term-raise px-2 py-1">
      <div className="text-term-hi">
        extended data ·{' '}
        {decoded.firstRecordKind === null
          ? 'no record stored'
          : `record ${decoded.firstRecordNumber ?? '-'} (${EXT_KIND_LABEL[decoded.firstRecordKind]})`}
      </div>
      <div className="mt-1 text-term-faint">raw {hexBytes(bytes)}</div>
    </div>
  );
};

export const UdsPanel: React.FC<UdsPanelProps> = ({ store, canTransmit, onTransmit }) => {
  const defs = store.defs;
  const monitor = store.monitor;
  const addr = defs.vehicle.addressing.primary;
  const [tab, setTab] = useState<Tab>('transactions');
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [hideRoutine, setHideRoutine] = useState(true);
  const [filter, setFilter] = useState('');

  const transactions = monitor.getTransactions();
  const alerts = monitor.getAlerts();
  const dids = monitor.getDids();
  const dtcs = monitor.getDtcs();
  const nrcName = (n: number) => defs.iso.nrcs.get(n);

  const needle = filter.trim().toLowerCase();
  const shown = (hideRoutine ? transactions.filter((t) => !(t.sid === 0x3e && t.status === 'suppressed')) : [...transactions])
    .filter((t) => needle === '' || (t.summary || hexBytes(t.request)).toLowerCase().includes(needle))
    .slice(-250)
    .reverse();
  const selected = transactions.find((t) => t.seq === selectedSeq) ?? shown[0];

  // ---------------------------------------------------------------- composer
  const services = useMemo(() => composerServices(defs), [defs]);
  const [sid, setSid] = useState<number>(0x22);
  const [sub, setSub] = useState<number>(0x03);
  const defaultDid = defs.vehicle.dids[0];
  const [didText, setDidText] = useState<string>(defaultDid ? hexDid(defaultDid.did) : '');
  const [extraText, setExtraText] = useState<string>('');
  const [composerLog, setComposerLog] = useState<string[]>([]);
  const svc = services.find((s) => s.sid === sid);

  const payload: number[] | null = (() => {
    const extra = parseHexBytes(extraText);
    if (extra === null) return null;
    const p = [sid];
    if (svc?.subFunctions) p.push(sub);
    if (svc?.takesDid) {
      const d = parseHexBytes(didText.replace(/^0x/i, '').padStart(4, '0'));
      if (!d || d.length !== 2) return null;
      p.push(...d);
    }
    return [...p, ...extra];
  })();
  const composed = payload ? composeUdsRequest(defs, payload) : null;

  const send = () => {
    if (!payload || !composed?.valid) return;
    const r = onTransmit(payload);
    setComposerLog((prev) =>
      [`${new Date().toLocaleTimeString()} ${hexBytes(payload)} → ${r.ok ? 'sent to the simulated ECU' : `refused: ${r.error}`}`, ...prev].slice(0, 20)
    );
    setSelectedSeq(null);
    setTab('transactions');
  };

  // ---------------------------------------------------------------- keys
  const moveSelection = (delta: number) => {
    if (tab !== 'transactions' || shown.length === 0) return;
    const i = selected ? shown.findIndex((t) => t.seq === selected.seq) : -1;
    const next = shown[Math.max(0, Math.min(shown.length - 1, (i < 0 ? 0 : i) + delta))];
    if (next) setSelectedSeq(next.seq);
  };
  // App owns t s o u h d space c x l / ? (GLOBAL_KEYS).
  useHotkeys({
    '1': () => setTab('transactions'),
    '2': () => setTab('dids'),
    '3': () => setTab('dtcs'),
    '4': () => setTab('composer'),
    j: () => moveSelection(1),
    k: () => moveSelection(-1),
    r: () => setHideRoutine((v) => !v),
  });

  const tabLabel: Record<Tab, string> = {
    transactions: 'transactions',
    dids: 'live dids',
    dtcs: 'dtcs',
    composer: 'composer',
  };

  const exportDtcs = (format: 'json' | 'csv') => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') downloadFile(dtcReportToJson(defs, dtcs), `dtc_report_${ts}.json`, 'application/json');
    else downloadFile(dtcReportToCsv(defs, dtcs), `dtc_report_${ts}.csv`, 'text/csv');
  };

  return (
    <div className="flex h-full select-none flex-col bg-term-bg">
      <Toolbar>
        <Segmented label="UDS view" hotkey="1-4" options={TABS.map((t) => ({ value: t, label: tabLabel[t] }))} value={tab} onChange={setTab} />
        {tab === 'transactions' && (
          <>
            <TermInput
              filter
              hotkey="/"
              placeholder="filter summary or bytes"
              aria-label="Filter transactions"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFilter('');
                  e.currentTarget.blur();
                }
              }}
            />
            <TermButton hotkey="R" toggled={hideRoutine} onClick={() => setHideRoutine((v) => !v)} title="Hide TesterPresent with suppressPosRsp">
              hide TesterPresent
            </TermButton>
          </>
        )}
        {tab === 'dtcs' && dtcs.length > 0 && (
          <>
            <TermButton boxed onClick={() => exportDtcs('json')}>
              export JSON
            </TermButton>
            <TermButton boxed onClick={() => exportDtcs('csv')}>
              export CSV
            </TermButton>
          </>
        )}
        <span className="ml-auto min-w-0 overflow-hidden text-ellipsis text-term-dim">
          tester <span className="text-term-fg">{hexId(addr.requestId, addr.extended)}</span> → ECU{' '}
          <span className="text-term-fg">{hexId(addr.responseId, addr.extended)}</span> · listen-only
        </span>
      </Toolbar>

      {alerts.length > 0 && (
        <div role="alert" className="max-h-[96px] shrink-0 overflow-auto border-b border-term-rule px-[14px] py-1">
          {alerts
            .slice(-5)
            .reverse()
            .map((a, i) => (
              <div key={i} className="flex gap-[1ch] text-term-red">
                <span aria-hidden="true">■</span>
                <span className="text-term-dim">{a.t.toFixed(3)} s</span>
                <span>{a.text}</span>
              </div>
            ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto">
          {tab === 'transactions' &&
            (shown.length === 0 ? (
              <Empty>{needle ? `No transaction matches “${filter}”.` : 'No UDS traffic seen on the vehicle bus.'}</Empty>
            ) : (
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="w-[22px]" />
                  <col className="w-[86px]" />
                  <col className="w-[170px]" />
                  <col />
                </colgroup>
                <thead className="sticky top-0 bg-term-bg">
                  <tr>
                    <th className={TH} aria-label="mark" />
                    <th className={cn(TH, 'text-right')}>t s</th>
                    <th className={TH}>status</th>
                    <th className={TH}>summary</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => {
                    const cur = selected?.seq === t.seq;
                    const violation = !t.policy.allowed;
                    return (
                      <tr
                        key={t.seq}
                        onClick={() => setSelectedSeq(t.seq)}
                        aria-selected={cur}
                        className={cn('cursor-pointer', cur ? 'bg-term-row' : 'hover:bg-term-row')}
                      >
                        <td className={cn(TD, 'pl-[6px] pr-0')}>
                          <GutterMark cursor={cur} fault={violation} />
                        </td>
                        <td className={cn(TD, 'text-right text-term-dim')}>{t.tStart.toFixed(3)}</td>
                        <td className={cn(TD, 'overflow-hidden text-ellipsis')}>
                          <StatusText t={t} nrcName={nrcName} />
                        </td>
                        <td className={cn(TD, 'overflow-hidden text-ellipsis', violation ? 'text-term-red' : 'text-term-fg')} title={violation ? t.policy.reason : undefined}>
                          {t.summary || hexBytes(t.request)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

          {tab === 'dids' && (
            <>
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-term-bg">
                  <tr>
                    <th className={cn(TH, 'pl-[14px]')}>did</th>
                    <th className={TH}>name</th>
                    <th className={cn(TH, 'text-right')}>value</th>
                    <th className={TH}>unit</th>
                    <th className={cn(TH, 'text-right')}>age ms</th>
                    <th className={cn(TH, 'text-right')}>poll ms</th>
                    <th className={cn(TH, 'text-right')}>reads</th>
                    <th className={TH}>state</th>
                  </tr>
                </thead>
                <tbody>
                  {dids.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-[14px] py-6 text-term-faint">
                        No ReadDataByIdentifier answer seen yet.
                      </td>
                    </tr>
                  )}
                  {dids.map((d) => {
                    const ageMs = Math.max(0, (store.lastTime - d.t) * 1000);
                    const stale = d.def ? ageMs > d.def.staleAfterMs : false;
                    const fault = d.nrc !== undefined;
                    return (
                      <tr key={d.did}>
                        <td className={cn(TD, 'pl-[14px] text-term-hi')}>{hexDid(d.did)}</td>
                        <td className={TD}>
                          {d.name}
                          {d.def && !d.def.verified && <span className="ml-[1ch] text-term-faint">unverified</span>}
                        </td>
                        <td className={cn(TD, 'text-right', fault || stale ? 'text-term-faint' : 'text-term-hi')}>
                          {d.value === null || d.value === undefined ? <Na /> : formatValue(d.value)}
                        </td>
                        <td className={cn(TD, 'text-term-faint')}>{d.unit || <Na />}</td>
                        <td className={cn(TD, 'text-right', stale ? 'text-term-amber' : 'text-term-dim')}>{d.count > 0 ? ageMs.toFixed(0) : <Na />}</td>
                        <td className={cn(TD, 'text-right text-term-dim')}>{d.def?.pollPeriodMs ?? <Na />}</td>
                        <td className={cn(TD, 'text-right text-term-dim')}>{d.count}</td>
                        <td className={TD}>
                          {fault ? (
                            <span className="text-term-red">
                              ■ nrc 0x{hex2(d.nrc!)} {nrcName(d.nrc!) ?? ''}
                            </span>
                          ) : stale ? (
                            <span className="text-term-amber">! stale</span>
                          ) : (
                            <span className="text-term-dim">fresh</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Note className="px-[14px]">stale = older than the DID's stale_after_ms in uds/vehicle_cl250.yaml.</Note>
            </>
          )}

          {tab === 'dtcs' &&
            (dtcs.length === 0 ? (
              <Empty>
                No DTC observed. The tester reads DTCs with service 0x19 at key-on and at warm idle (D-080); codes appear here when an answer reports one.
              </Empty>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-term-bg">
                  <tr>
                    <th className={cn(TH, 'pl-[14px]')}>code</th>
                    <th className={TH}>status</th>
                    <th className={TH}>status bits</th>
                    <th className={cn(TH, 'text-right')}>first s</th>
                    <th className={cn(TH, 'text-right')}>last s</th>
                    <th className={TH}>freeze frame</th>
                  </tr>
                </thead>
                <tbody>
                  {dtcs.map((d) => (
                    <tr key={d.dtc}>
                      <td className={cn(TD, 'pl-[14px] text-term-red')}>■ {d.code}</td>
                      <td className={cn(TD, 'text-term-dim')}>0x{hex2(d.status)}</td>
                      <td className={cn(TD, 'whitespace-normal')}>{d.statusNames.join(' · ')}</td>
                      <td className={cn(TD, 'text-right text-term-dim')}>{d.firstSeen.toFixed(2)}</td>
                      <td className={cn(TD, 'text-right text-term-dim')}>{d.lastSeen.toFixed(2)}</td>
                      <td className={cn(TD, 'whitespace-normal')}>
                        <DtcRecordCell defs={defs} entry={d} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          {tab === 'dtcs' && dtcs.some((d) => d.snapshot || d.extData) && (
            <Note className="px-[14px]">
              Freeze frames are decoded with uds/iso14229.yaml dtc_record_reports and the DID catalog; an unknown or variable-length DID stops
              the walk and the rest stays raw (D-080 item 5).
            </Note>
          )}

          {tab === 'composer' && (
            <div className="max-w-[720px] px-[14px] py-[10px]">
              <p className="mb-3 italic text-term-dim">
                Simulation only. The composer sends only to the simulated ECU of the virtual bus; on a real vehicle bus the analyzer stays listen-only,
                because the bus has one tester, rt-core (Invariant 1, D-037).
              </p>
              <div className="grid grid-cols-[14ch_1fr] items-center gap-x-4 gap-y-2">
                <label htmlFor="uds-sid" className="text-term-dim">
                  service
                </label>
                <select
                  id="uds-sid"
                  value={sid}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    setSid(s);
                    const first = services.find((x) => x.sid === s)?.subFunctions?.[0];
                    if (first) setSub(first.id);
                  }}
                  className="term-select justify-self-start"
                >
                  {services.map((s) => (
                    <option key={s.sid} value={s.sid} disabled={!s.allowed}>
                      0x{hex2(s.sid)} {s.name}
                      {!s.allowed ? ' (forbidden by tester_policy)' : ''}
                    </option>
                  ))}
                </select>
                {svc?.subFunctions && (
                  <>
                    <label htmlFor="uds-sub" className="text-term-dim">
                      sub-function
                    </label>
                    <select id="uds-sub" value={sub} onChange={(e) => setSub(Number(e.target.value))} className="term-select justify-self-start">
                      {svc.subFunctions.map((s) => (
                        <option key={s.id} value={s.id}>
                          0x{hex2(s.id)} {s.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {svc?.takesDid && (
                  <>
                    <label htmlFor="uds-did" className="text-term-dim">
                      did
                    </label>
                    <select id="uds-did" value={didText} onChange={(e) => setDidText(e.target.value)} className="term-select justify-self-start">
                      <optgroup label="uds/vehicle_cl250.yaml">
                        {defs.vehicle.dids.map((d) => (
                          <option key={d.did} value={`0x${d.did.toString(16).toUpperCase()}`}>
                            0x{d.did.toString(16).toUpperCase()} {d.name}
                            {d.verified ? '' : ' (unverified)'}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="uds/obd_catalog.yaml identification">
                        {defs.identification.map((d) => (
                          <option key={d.did} value={`0x${d.did.toString(16).toUpperCase()}`}>
                            0x{d.did.toString(16).toUpperCase()} {d.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </>
                )}
                <label htmlFor="uds-extra" className="text-term-dim">
                  further bytes
                </label>
                <span className="flex items-center gap-3">
                  <TermInput id="uds-extra" value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="0C" className="min-w-[160px]" />
                  <span className="text-term-faint">hex, e.g. the DTC status mask for 0x19 0x02</span>
                </span>
                <span className="text-term-dim">frame</span>
                <span>
                  {composed === null ? (
                    <span className="text-term-red">■ bytes are not valid hex</span>
                  ) : composed.valid ? (
                    <>
                      <span className="text-term-dim">single frame on {hexId(addr.requestId, addr.extended)}</span>{' '}
                      <span className="text-term-hi">{hexBytes(composed.canFrameData)}</span>
                    </>
                  ) : (
                    <span className="text-term-red">■ {composed.errorMessage}</span>
                  )}
                </span>
                <span />
                <span>
                  <TermButton boxed onClick={send} disabled={!canTransmit || !composed?.valid}>
                    {canTransmit ? 'send to simulated ECU' : 'only with the running virtual bus'}
                  </TermButton>
                </span>
              </div>
              {composerLog.length > 0 && (
                <div className="mt-4 border-t border-term-rule pt-2 text-term-dim">
                  {composerLog.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside aria-label="Transaction detail" className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-l border-term-rule bg-term-raise">
          <Pane title="ISO-TP ladder" aside={selected ? `${selected.frames.length} frames` : undefined}>
            {!selected ? (
              <span className="text-term-faint">Select a transaction.</span>
            ) : (
              <>
                <div className="mb-1 flex justify-between text-term-dim">
                  <span>tester {hexId(addr.requestId, addr.extended)}</span>
                  <span>ECU {hexId(addr.responseId, addr.extended)}</span>
                </div>
                <div className="grid grid-cols-[9ch_3ch_2ch_1fr] gap-x-2 whitespace-nowrap">
                  {selected.frames.map((f, i) => (
                    <React.Fragment key={i}>
                      <span className="text-right text-term-faint">+{((f.t - selected.tStart) * 1000).toFixed(1)}</span>
                      <span className="text-term-dim">{f.pci}</span>
                      <span className="text-term-dim">{f.dir === 'req' ? '→' : '←'}</span>
                      <span className={f.dir === 'req' ? 'text-term-fg' : 'text-term-hi'}>{hexBytes(f.data)}</span>
                    </React.Fragment>
                  ))}
                </div>
                <div className="mt-2 border-t border-term-rule pt-2">
                  <KeyValues
                    rows={[
                      ['request', hexBytes(selected.request)],
                      ['response', selected.response ? <span className="text-term-hi">{hexBytes(selected.response)}</span> : <Na />],
                      ['status', <StatusText key="s" t={selected} nrcName={nrcName} />],
                      [
                        'round trip',
                        selected.tEnd !== undefined && selected.status !== 'suppressed' ? `${((selected.tEnd - selected.tStart) * 1000).toFixed(1)} ms` : <Na />,
                      ],
                    ]}
                  />
                  <div className="mt-2 whitespace-normal">{selected.summary}</div>
                  {!selected.policy.allowed && (
                    <p className="mt-1 italic text-term-red">■ Outside tester_policy: {selected.policy.reason}</p>
                  )}
                </div>
              </>
            )}
          </Pane>

          <Pane title="tester_policy" aside={`defs ${defs.ref}`}>
            <KeyValues
              rows={[
                ...defs.vehicle.testerPolicy.allowed.map(
                  (a) =>
                    [
                      <span key="k">
                        0x{hex2(a.sid)} {defs.iso.services.get(a.sid) ?? a.name}
                      </span>,
                      a.subfunctions ? a.subfunctions.map((s) => `0x${hex2(s)}`).join(' ') : <Na />,
                    ] as [React.ReactNode, React.ReactNode]
                ),
                ['forbidden', <span key="f">{defs.vehicle.testerPolicy.forbidden.map((s) => `0x${hex2(s)}`).join(' ')}</span>],
              ]}
            />
            <Note>The policy may only be narrowed (D-020, D-027). A request outside it is marked with a red ■.</Note>
          </Pane>
        </aside>
      </div>
    </div>
  );
};
