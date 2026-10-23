import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, Layers, Lock, Send, ShieldCheck, Terminal } from 'lucide-react';
import { CaptureStore } from '../state/captureStore';
import { UdsTransaction } from '../services/udsMonitor';
import { composeUdsRequest, composerServices } from '../services/udsComposer';
import { formatValue, hexId } from '../services/format';

interface UdsPanelProps {
  store: CaptureStore;
  /** True only when the virtual bus is the running source (the simulated ECU). */
  canTransmit: boolean;
  onTransmit: (payload: number[]) => { ok: boolean; error?: string };
}

type Tab = 'transactions' | 'dids' | 'dtcs' | 'composer';

const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
const hexBytes = (b: number[]) => b.map(hex2).join(' ');

const STATUS_TONE: Record<UdsTransaction['status'], string> = {
  positive: 'text-emerald-300 border-emerald-700',
  negative: 'text-rose-300 border-rose-700',
  pending: 'text-amber-300 border-amber-700',
  no_response: 'text-rose-300 border-rose-800',
  suppressed: 'text-slate-400 border-slate-600',
};

function parseHexBytes(text: string): number[] | null {
  const clean = text.replace(/0x/gi, '').replace(/[\s,]+/g, '');
  if (clean === '') return [];
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.substring(i, i + 2), 16));
  return out;
}

export const UdsPanel: React.FC<UdsPanelProps> = ({ store, canTransmit, onTransmit }) => {
  const defs = store.defs;
  const monitor = store.monitor;
  const addr = defs.vehicle.addressing.primary;
  const [tab, setTab] = useState<Tab>('transactions');
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [hideRoutine, setHideRoutine] = useState(true);

  const transactions = monitor.getTransactions();
  const alerts = monitor.getAlerts();
  const dids = monitor.getDids();
  const dtcs = monitor.getDtcs();

  const shown = (hideRoutine ? transactions.filter((t) => !(t.sid === 0x3e && t.status === 'suppressed')) : [...transactions]).slice(-250).reverse();
  const selected = transactions.find((t) => t.seq === selectedSeq) ?? shown[0];

  // ---------------------------------------------------------------- composer
  const services = useMemo(() => composerServices(defs), [defs]);
  const [sid, setSid] = useState<number>(0x22);
  const [sub, setSub] = useState<number>(0x03);
  const [didText, setDidText] = useState<string>('0xF40C');
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

  const TabButton: React.FC<{ id: Tab; label: string }> = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-1.5 rounded text-xs font-semibold ${tab === id ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-background font-mono text-xs select-none">
      <div className="bg-surface/80 border-b border-surface-border px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-slate-200">UDS observer — vehicle bus</span>
          <span className="text-[10px] text-slate-400">
            tester {hexId(addr.requestId, addr.extended)} → ECU {hexId(addr.responseId, addr.extended)} · ISO 14229 / ISO 15765-2
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-300">Listen-only · policy from defs {defs.ref}</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="bg-rose-950/40 border-b border-rose-800 px-4 py-1.5 max-h-24 overflow-auto">
          {alerts
            .slice(-5)
            .reverse()
            .map((a, i) => (
              <div key={i} className="flex gap-2 text-rose-200 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="text-rose-400">{a.t.toFixed(3)}s</span>
                <span>{a.text}</span>
              </div>
            ))}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="w-full lg:w-3/5 border-r border-surface-border p-3 flex flex-col gap-3 overflow-hidden">
          <div className="flex items-center bg-surface border border-surface-border rounded p-0.5 gap-0.5">
            <TabButton id="transactions" label={`Transactions (${transactions.length})`} />
            <TabButton id="dids" label={`Live DIDs (${dids.length})`} />
            <TabButton id="dtcs" label={`DTCs (${dtcs.length})`} />
            <TabButton id="composer" label="Composer (sim)" />
          </div>

          {tab === 'transactions' && (
            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <input type="checkbox" checked={hideRoutine} onChange={(e) => setHideRoutine(e.target.checked)} />
                hide TesterPresent (suppressPosRsp)
              </label>
              <div className="flex-1 overflow-auto">
                {shown.length === 0 ? (
                  <div className="text-slate-500 py-10 text-center">No UDS traffic seen on the vehicle bus.</div>
                ) : (
                  shown.map((t) => (
                    <button
                      key={t.seq}
                      onClick={() => setSelectedSeq(t.seq)}
                      className={`w-full text-left grid grid-cols-[70px_84px_1fr] gap-2 px-2 py-1 rounded border mb-0.5 ${
                        selected?.seq === t.seq ? 'bg-purple-950/30 border-purple-600/60' : 'border-transparent hover:bg-surface-elevated/40'
                      }`}
                    >
                      <span className="text-slate-500">{t.tStart.toFixed(3)}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded border text-center self-start ${STATUS_TONE[t.status]}`}>{t.status}</span>
                      <span className={t.policy.allowed ? 'text-slate-200' : 'text-rose-300'}>
                        {!t.policy.allowed && <Lock className="inline w-3 h-3 mr-1" />}
                        {t.summary || hexBytes(t.request)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'dids' && (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead className="text-slate-400 text-[10px] sticky top-0 bg-background">
                  <tr>
                    <th className="py-1 pr-2">DID</th>
                    <th className="py-1 pr-2">NAME</th>
                    <th className="py-1 pr-2 text-right">VALUE</th>
                    <th className="py-1 pr-2">UNIT</th>
                    <th className="py-1 pr-2 text-right">AGE ms</th>
                    <th className="py-1 pr-2 text-right">POLL ms</th>
                    <th className="py-1 pr-2 text-right">READS</th>
                    <th className="py-1">STATE</th>
                  </tr>
                </thead>
                <tbody>
                  {dids.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        No ReadDataByIdentifier answer seen yet.
                      </td>
                    </tr>
                  )}
                  {dids.map((d) => {
                    const ageMs = Math.max(0, (store.lastTime - d.t) * 1000);
                    const stale = d.def ? ageMs > d.def.staleAfterMs : false;
                    let state: { text: string; tone: string };
                    if (d.nrc !== undefined) state = { text: `NRC 0x${hex2(d.nrc)} ${defs.iso.nrcs.get(d.nrc) ?? ''}`, tone: 'text-rose-300' };
                    else if (stale) state = { text: 'STALE', tone: 'text-amber-300' };
                    else state = { text: 'FRESH', tone: 'text-emerald-300' };
                    return (
                      <tr key={d.did} className="border-t border-surface-border/40">
                        <td className="py-1 pr-2 text-cyan-400">0x{d.did.toString(16).toUpperCase()}</td>
                        <td className="py-1 pr-2 text-slate-200">
                          {d.name}
                          {d.def && !d.def.verified && <span className="ml-1 text-[9px] text-amber-400">unverified</span>}
                        </td>
                        <td className="py-1 pr-2 text-right text-cyan-200 font-semibold">{formatValue(d.value)}</td>
                        <td className="py-1 pr-2 text-slate-400">{d.unit}</td>
                        <td className="py-1 pr-2 text-right text-slate-400">{d.count > 0 ? ageMs.toFixed(0) : '–'}</td>
                        <td className="py-1 pr-2 text-right text-slate-500">{d.def?.pollPeriodMs ?? '–'}</td>
                        <td className="py-1 pr-2 text-right text-slate-500">{d.count}</td>
                        <td className={`py-1 ${state.tone}`}>{state.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-2">STALE = older than the DID's stale_after_ms in uds/vehicle_cl250.yaml.</p>
            </div>
          )}

          {tab === 'dtcs' && (
            <div className="flex-1 overflow-auto flex flex-col gap-2">
              {dtcs.length === 0 ? (
                <div className="text-slate-500 py-10 text-center leading-relaxed">
                  No DTC observed. The tester reads DTCs with service 0x19 at key-on and at warm idle (D-080);
                  <br />
                  codes appear here when an answer reports one.
                </div>
              ) : (
                dtcs.map((d) => (
                  <div key={d.dtc} className="bg-surface/60 border border-surface-border rounded p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-rose-300">{d.code}</span>
                      <span className="text-[10px] text-slate-400">status 0x{hex2(d.status)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {d.statusNames.map((n) => (
                        <span key={n} className="text-[9px] px-1.5 py-0.5 rounded border border-surface-border text-slate-300">
                          {n}
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      first {d.firstSeen.toFixed(2)} s · last {d.lastSeen.toFixed(2)} s
                    </div>
                    {(d.snapshot || d.extData) && (
                      <div className="text-[10px] text-slate-400">
                        {d.snapshot && <div>snapshot record: {hexBytes(d.snapshot)}</div>}
                        {d.extData && <div>extended data: {hexBytes(d.extData)}</div>}
                        <div className="text-slate-500">Shown raw: record layouts are manufacturer-specific and not yet defined in defs (D-080 item 5).</div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'composer' && (
            <div className="flex flex-col gap-3 overflow-auto">
              <div
                className={`rounded p-2.5 text-[11px] border ${
                  canTransmit ? 'bg-emerald-950/20 border-emerald-700 text-emerald-200' : 'bg-slate-900 border-surface-border text-slate-400'
                }`}
              >
                The composer sends only to the simulated ECU of the virtual bus. On a real vehicle bus the analyzer stays listen-only: the bus has one
                tester, rt-core (Invariant 1, D-037).
              </div>
              <div className="flex flex-col gap-2 bg-surface/60 border border-surface-border rounded p-3">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px]">Service</span>
                  <select
                    value={sid}
                    onChange={(e) => {
                      const s = Number(e.target.value);
                      setSid(s);
                      const first = services.find((x) => x.sid === s)?.subFunctions?.[0];
                      if (first) setSub(first.id);
                    }}
                    className="bg-background border border-surface-border rounded px-2 py-1.5 text-slate-200"
                  >
                    {services.map((s) => (
                      <option key={s.sid} value={s.sid} disabled={!s.allowed}>
                        0x{hex2(s.sid)} {s.name}
                        {!s.allowed ? ' — forbidden by tester_policy' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {svc?.subFunctions && (
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-400 text-[11px]">Sub-function</span>
                    <select value={sub} onChange={(e) => setSub(Number(e.target.value))} className="bg-background border border-surface-border rounded px-2 py-1.5 text-slate-200">
                      {svc.subFunctions.map((s) => (
                        <option key={s.id} value={s.id}>
                          0x{hex2(s.id)} {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {svc?.takesDid && (
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-400 text-[11px]">DID</span>
                    <select value={didText} onChange={(e) => setDidText(e.target.value)} className="bg-background border border-surface-border rounded px-2 py-1.5 text-slate-200">
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
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px]">Further bytes (hex), e.g. the DTC status mask for 0x19 0x02</span>
                  <input value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="0C" className="bg-background border border-surface-border rounded px-2 py-1.5 text-slate-200" />
                </label>
                <div className="text-[11px]">
                  {composed === null ? (
                    <span className="text-rose-300">Bytes are not valid hex.</span>
                  ) : composed.valid ? (
                    <span className="text-slate-300">
                      Single Frame on {hexId(addr.requestId, addr.extended)}: <span className="text-cyan-300">{hexBytes(composed.canFrameData)}</span>
                    </span>
                  ) : (
                    <span className="text-rose-300">{composed.errorMessage}</span>
                  )}
                </div>
                <button
                  onClick={send}
                  disabled={!canTransmit || !composed?.valid}
                  className="flex items-center justify-center gap-2 py-2 rounded font-semibold bg-purple-600 hover:bg-purple-500 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {canTransmit ? <Send className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {canTransmit ? 'Send to simulated ECU' : 'Only with the running virtual bus'}
                </button>
              </div>
              {composerLog.map((l, i) => (
                <div key={i} className="text-[10px] text-slate-400">
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-full lg:w-2/5 p-3 flex flex-col gap-3 overflow-auto">
          <div className="bg-surface/60 border border-surface-border rounded p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-surface-border pb-1.5">
              <span className="flex items-center gap-2 text-slate-200 font-semibold">
                <Layers className="w-4 h-4 text-purple-400" />
                ISO-TP ladder
              </span>
              <span className="text-[10px] text-slate-500">{selected ? `${selected.frames.length} frames on the bus` : ''}</span>
            </div>
            {!selected ? (
              <div className="text-slate-500 py-6 text-center">Select a transaction.</div>
            ) : (
              <>
                <div className="flex justify-between text-[10px] text-slate-400 px-1">
                  <span className="text-cyan-400">tester {hexId(addr.requestId, addr.extended)}</span>
                  <span className="text-emerald-400">ECU {hexId(addr.responseId, addr.extended)}</span>
                </div>
                {selected.frames.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] bg-background/60 p-1.5 rounded border border-surface-border/60">
                    <span className="text-slate-500 w-16">+{((f.t - selected.tStart) * 1000).toFixed(1)} ms</span>
                    <span className={`w-6 font-bold ${f.dir === 'req' ? 'text-cyan-300' : 'text-emerald-300'}`}>{f.pci}</span>
                    {f.dir === 'req' ? <ArrowRight className="w-3.5 h-3.5 text-cyan-400" /> : <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />}
                    <span className={f.dir === 'req' ? 'text-cyan-200' : 'text-emerald-200'}>{hexBytes(f.data)}</span>
                  </div>
                ))}
                <div className="flex flex-col gap-1 text-[11px] border-t border-surface-border pt-2">
                  <div>
                    <span className="text-slate-400">request </span>
                    <span className="text-cyan-200">{hexBytes(selected.request)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">response </span>
                    <span className="text-emerald-200">{selected.response ? hexBytes(selected.response) : '–'}</span>
                  </div>
                  <div className="text-slate-200">{selected.summary}</div>
                  {!selected.policy.allowed && <div className="text-rose-300">Outside tester_policy: {selected.policy.reason}</div>}
                  {selected.tEnd !== undefined && selected.status !== 'suppressed' && (
                    <div className="text-slate-500">round trip {((selected.tEnd - selected.tStart) * 1000).toFixed(1)} ms</div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="bg-surface/40 border border-surface-border rounded p-3 text-[11px] text-slate-400 flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" /> tester_policy
            </span>
            {defs.vehicle.testerPolicy.allowed.map((a) => (
              <span key={a.sid}>
                0x{hex2(a.sid)} {defs.iso.services.get(a.sid) ?? a.name}
                {a.subfunctions ? ` [${a.subfunctions.map((s) => `0x${hex2(s)}`).join(', ')}]` : ''}
              </span>
            ))}
            <span className="text-rose-300/80">forbidden: {defs.vehicle.testerPolicy.forbidden.map((s) => `0x${hex2(s)}`).join(' ')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
