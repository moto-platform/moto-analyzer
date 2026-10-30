import { CanFrame } from '../types/can';
import { Defs, DidDef, IdentificationDid, decodeDid } from '../defs/model';
import { IsoTpReassembler } from './isoTp';
import { checkTesterPolicy } from './udsComposer';

/**
 * Passive UDS observer of the vehicle bus. It never transmits: it reassembles the
 * tester's requests and the ECU's answers (ISO 15765-2), pairs them, decodes them with
 * vehicle-defs (DID formulas, ISO 14229 names) and flags what the platform rules
 * forbid (a request outside tester_policy, a functional request = a second tester).
 */

export type PciType = 'SF' | 'FF' | 'CF' | 'FC' | '?';

export interface UdsFrameRecord {
  t: number;
  dir: 'req' | 'resp';
  id: number;
  data: number[];
  pci: PciType;
}

export type TransactionStatus = 'pending' | 'positive' | 'negative' | 'no_response' | 'suppressed';

export interface UdsTransaction {
  seq: number;
  tStart: number;
  tEnd?: number;
  sid: number;
  request: number[];
  response?: number[];
  frames: UdsFrameRecord[];
  status: TransactionStatus;
  summary: string;
  nrc?: number;
  policy: { allowed: boolean; reason?: string };
}

export interface DidSample {
  def?: DidDef;
  ident?: IdentificationDid;
  did: number;
  name: string;
  value: number | string | null;
  unit: string;
  raw: number[];
  t: number;
  count: number;
  /** Last NRC the ECU answered for this DID, if any. */
  nrc?: number;
}

export interface DtcEntry {
  dtc: number;
  code: string;
  status: number;
  statusNames: string[];
  firstSeen: number;
  lastSeen: number;
  snapshot?: number[];
  extData?: number[];
}

export interface UdsAlert {
  t: number;
  kind: 'policy_violation' | 'functional_request' | 'iso_tp_abort';
  text: string;
}

const MAX_TRANSACTIONS = 400;
const MAX_ALERTS = 100;
const hex = (n: number, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
const hexBytes = (b: number[]) => b.map((x) => hex(x)).join(' ');

/** ISO 14229-1 Annex D 3-byte DTC as SAE J2012 text, e.g. 0x011500 -> P0115-00. */
export function formatDtc(dtc: number): string {
  const hi = (dtc >> 16) & 0xff;
  const letter = 'PCBU'[(hi >> 6) & 0x03];
  const d1 = (hi >> 4) & 0x03;
  const d2 = hi & 0x0f;
  const mid = (dtc >> 8) & 0xff;
  return `${letter}${d1}${d2.toString(16).toUpperCase()}${hex(mid)}-${hex(dtc & 0xff)}`;
}

export class UdsMonitor {
  public version = 0;
  /** Called for every decoded DID answer (used to plot DID values over time). */
  public onDid: ((sample: DidSample) => void) | null = null;
  private seq = 0;
  private transactions: UdsTransaction[] = [];
  private dids = new Map<number, DidSample>();
  private dtcs = new Map<number, DtcEntry>();
  private alerts: UdsAlert[] = [];
  private reqIds: Set<number>;
  private respIds: Set<number>;
  private watchIds: Set<number>;
  private reassemblers = new Map<number, IsoTpReassembler>();
  private didDefs: Map<number, DidDef>;
  private identDefs: Map<number, IdentificationDid>;

  constructor(private readonly defs: Defs) {
    const a = defs.vehicle.addressing;
    this.reqIds = new Set([a.primary.requestId, ...(a.fallback ? [a.fallback.requestId] : [])]);
    this.respIds = new Set([a.primary.responseId, ...(a.fallback ? [a.fallback.responseId] : [])]);
    this.watchIds = new Set(a.functionalWatchIds.map((w) => w.id));
    this.didDefs = new Map(defs.vehicle.dids.map((d) => [d.did, d]));
    this.identDefs = new Map(defs.identification.map((d) => [d.did, d]));
  }

  public isUdsId(id: number): boolean {
    return this.reqIds.has(id) || this.respIds.has(id) || this.watchIds.has(id);
  }

  /** Feeds one frame; returns true when it belonged to the UDS conversation. */
  public process(frame: CanFrame): boolean {
    const t = frame.timestamp;
    this.expire(t);

    if (this.watchIds.has(frame.id)) {
      this.alert(t, 'functional_request', `Functional request on 0x${hex(frame.id, frame.isExtended ? 8 : 3)}: a second tester is on the bus (D-021, D-040). Data ${hexBytes(frame.data)}`);
      return true;
    }
    const dir: 'req' | 'resp' | null = this.reqIds.has(frame.id) ? 'req' : this.respIds.has(frame.id) ? 'resp' : null;
    if (!dir) return false;

    const pciNibble = (frame.data[0] ?? 0xff) >> 4;
    const pci: PciType = (['SF', 'FF', 'CF', 'FC'] as PciType[])[pciNibble] ?? '?';
    const record: UdsFrameRecord = { t, dir, id: frame.id, data: frame.data, pci };

    // A new request starts a transaction; everything else joins the newest pending one.
    if (dir === 'req' && (pci === 'SF' || pci === 'FF')) {
      this.transactions.push({
        seq: ++this.seq,
        tStart: t,
        sid: pci === 'SF' ? frame.data[1] : frame.data[2],
        request: [],
        frames: [record],
        status: 'pending',
        summary: '',
        policy: { allowed: true },
      });
      if (this.transactions.length > MAX_TRANSACTIONS) this.transactions.shift();
    } else {
      this.currentPending()?.frames.push(record);
    }

    let r = this.reassemblers.get(frame.id);
    if (!r) {
      r = new IsoTpReassembler();
      this.reassemblers.set(frame.id, r);
    }
    const res = r.processFrame(frame.id, frame.data, t * 1000);
    if (res.aborted) this.alert(t, 'iso_tp_abort', `ISO-TP reception on 0x${hex(frame.id, 8)} aborted: ${res.aborted}`);
    if (res.isComplete && res.reassembledPayload) {
      if (dir === 'req') this.onRequest(res.reassembledPayload, t);
      else this.onResponse(res.reassembledPayload, t);
    }
    this.version++;
    return true;
  }

  private currentPending(): UdsTransaction | undefined {
    for (let i = this.transactions.length - 1; i >= 0; i--) {
      if (this.transactions[i].status === 'pending') return this.transactions[i];
    }
    return undefined;
  }

  private onRequest(payload: number[], t: number) {
    const tx = this.transactions[this.transactions.length - 1];
    if (!tx) return;
    tx.request = payload;
    tx.sid = payload[0];
    tx.policy = checkTesterPolicy(this.defs, payload);
    tx.summary = this.describeRequest(payload);
    if (!tx.policy.allowed) {
      this.alert(t, 'policy_violation', `Tester sent ${hexBytes(payload)}: ${tx.policy.reason}`);
    }
    const sub = payload[1];
    const hasSub = payload.length > 1 && (tx.sid === 0x10 || tx.sid === 0x3e || tx.sid === 0x19);
    if (hasSub && sub & this.defs.iso.suppressPosRspBit) {
      tx.status = 'suppressed';
      tx.tEnd = t;
    }
  }

  private onResponse(payload: number[], t: number) {
    const iso = this.defs.iso;
    const isNeg = payload[0] === iso.negativeResponseSid;
    const reqSid = isNeg ? payload[1] : payload[0] - iso.positiveResponseOffset;
    // The newest unanswered request of that service.
    let tx: UdsTransaction | undefined;
    for (let i = this.transactions.length - 1; i >= 0; i--) {
      const c = this.transactions[i];
      if (c.sid === reqSid && (c.status === 'pending' || c.status === 'suppressed') && c.request.length > 0) {
        tx = c;
        break;
      }
    }

    if (isNeg) {
      const nrc = payload[2];
      if (nrc === 0x78) {
        // responsePending: the answer is still to come.
        if (tx) tx.summary += ' · response pending (NRC 0x78)';
        return;
      }
      if (tx) {
        tx.status = 'negative';
        tx.response = payload;
        tx.nrc = nrc;
        tx.tEnd = t;
        tx.summary = `${this.describeRequest(tx.request)} → NRC 0x${hex(nrc)} ${iso.nrcs.get(nrc) ?? ''}`.trim();
        if (tx.sid === 0x22 && tx.request.length >= 3) {
          const did = (tx.request[1] << 8) | tx.request[2];
          const s = this.didSample(did, t);
          s.nrc = nrc;
          this.dids.set(did, s);
        }
      }
      return;
    }

    if (!tx) return;
    tx.status = 'positive';
    tx.response = payload;
    tx.tEnd = t;
    tx.summary = this.describeResponse(tx, payload, t);
  }

  private describeRequest(p: number[]): string {
    const iso = this.defs.iso;
    const sid = p[0];
    const name = iso.services.get(sid) ?? `SID 0x${hex(sid)}`;
    if (sid === 0x22 && p.length >= 3) {
      const ids: string[] = [];
      for (let i = 1; i + 1 < p.length; i += 2) {
        const did = (p[i] << 8) | p[i + 1];
        ids.push(`0x${hex(did, 4)} ${this.didDefs.get(did)?.name ?? this.identDefs.get(did)?.name ?? ''}`.trim());
      }
      return `${name} ${ids.join(', ')}`;
    }
    if (sid === 0x10 && p.length >= 2) return `${name} ${iso.sessions.get(p[1] & 0x7f) ?? `0x${hex(p[1])}`}`;
    if (sid === 0x19 && p.length >= 2) return `${name} ${iso.readDtcSubfunctions.get(p[1] & 0x7f) ?? `0x${hex(p[1])}`}`;
    return `${name} ${hexBytes(p.slice(1))}`.trim();
  }

  private didSample(did: number, t: number): DidSample {
    const prev = this.dids.get(did);
    const def = this.didDefs.get(did);
    const ident = this.identDefs.get(did);
    return (
      prev ?? {
        def,
        ident,
        did,
        name: def?.name ?? ident?.name ?? `DID 0x${hex(did, 4)}`,
        value: null,
        unit: def?.unit ?? '',
        raw: [],
        t,
        count: 0,
      }
    );
  }

  private describeResponse(tx: UdsTransaction, p: number[], t: number): string {
    const iso = this.defs.iso;
    const reqText = this.describeRequest(tx.request);
    switch (tx.sid) {
      case 0x10: {
        if (p.length >= 6) {
          const p2 = ((p[2] << 8) | p[3]) * iso.p2ResolutionMs;
          const p2s = ((p[4] << 8) | p[5]) * iso.p2StarResolutionMs;
          return `${reqText} → accepted, P2=${p2} ms, P2*=${p2s} ms`;
        }
        return `${reqText} → accepted`;
      }
      case 0x22: {
        // One DID per request on this tester; decode the first record.
        if (p.length < 3) return `${reqText} → malformed answer`;
        const did = (p[1] << 8) | p[2];
        const data = p.slice(3);
        const s = this.didSample(did, t);
        let value: number | string | null = null;
        if (s.def) value = decodeDid(s.def, data);
        else if (s.ident) value = String.fromCharCode(...data.filter((b) => b >= 0x20 && b < 0x7f));
        const sample: DidSample = { ...s, value, raw: data, t, count: s.count + 1, nrc: undefined };
        this.dids.set(did, sample);
        this.onDid?.(sample);
        const shown = typeof value === 'number' ? `${Number(value.toFixed(3))} ${s.unit}` : value ?? hexBytes(data);
        return `${reqText} = ${shown}`.trim();
      }
      case 0x19:
        return `${reqText} → ${this.decodeDtcResponse(p, t)}`;
      case 0x3e:
        return `${reqText} → ok`;
      default:
        return `${reqText} → ${hexBytes(p)}`;
    }
  }

  private decodeDtcResponse(p: number[], t: number): string {
    const sub = p[1];
    const statusNames = (s: number) => this.defs.iso.dtcStatusBits.filter((b) => s & b.mask).map((b) => b.name);
    const upsert = (dtc: number, status: number) => {
      const prev = this.dtcs.get(dtc);
      const entry: DtcEntry = prev
        ? { ...prev, status, statusNames: statusNames(status), lastSeen: t }
        : { dtc, code: formatDtc(dtc), status, statusNames: statusNames(status), firstSeen: t, lastSeen: t };
      this.dtcs.set(dtc, entry);
      return entry;
    };

    if (sub === 0x01 && p.length >= 6) {
      return `${(p[4] << 8) | p[5]} DTC(s) match the mask`;
    }
    if ((sub === 0x02 || sub === 0x0a) && p.length >= 3) {
      const n = Math.floor((p.length - 3) / 4);
      for (let i = 0; i < n; i++) {
        const o = 3 + i * 4;
        upsert((p[o] << 16) | (p[o + 1] << 8) | p[o + 2], p[o + 3]);
      }
      return n === 0 ? 'no DTC' : `${n} DTC(s)`;
    }
    if ((sub === 0x04 || sub === 0x06) && p.length >= 6) {
      // Keep the record bytes raw; UdsPanel decodes them with the defs framing (D-090).
      const dtc = (p[2] << 16) | (p[3] << 8) | p[4];
      const e = upsert(dtc, p[5]);
      if (sub === 0x04) e.snapshot = p.slice(6);
      else e.extData = p.slice(6);
      return `${formatDtc(dtc)} ${sub === 0x04 ? 'snapshot' : 'extended data'} (${p.length - 6} raw bytes)`;
    }
    return hexBytes(p);
  }

  /** Requests without an answer after response_timeout_max_ms become no_response. */
  private expire(t: number) {
    const limit = this.defs.vehicle.timing.responseTimeoutMaxMs / 1000;
    for (let i = this.transactions.length - 1; i >= 0 && i >= this.transactions.length - 20; i--) {
      const tx = this.transactions[i];
      if (tx.status === 'pending' && tx.request.length > 0 && t - tx.tStart > limit) {
        tx.status = 'no_response';
        tx.tEnd = t;
        tx.summary = `${this.describeRequest(tx.request)} → no answer`;
        this.version++;
      }
    }
  }

  private alert(t: number, kind: UdsAlert['kind'], text: string) {
    this.alerts.push({ t, kind, text });
    if (this.alerts.length > MAX_ALERTS) this.alerts.shift();
    this.version++;
  }

  public getTransactions(): readonly UdsTransaction[] {
    return this.transactions;
  }
  public getDids(): DidSample[] {
    return [...this.dids.values()].sort((a, b) => a.did - b.did);
  }
  public getDid(name: string): DidSample | undefined {
    for (const s of this.dids.values()) if (s.name === name) return s;
    return undefined;
  }
  public getDtcs(): DtcEntry[] {
    return [...this.dtcs.values()].sort((a, b) => a.dtc - b.dtc);
  }
  public getAlerts(): readonly UdsAlert[] {
    return this.alerts;
  }

  public reset() {
    this.transactions = [];
    this.dids.clear();
    this.dtcs.clear();
    this.alerts = [];
    this.reassemblers.clear();
    this.version++;
  }
}
