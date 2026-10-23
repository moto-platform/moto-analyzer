import { parse as parseYaml } from 'yaml';
import { DbcCatalog } from '../types/can';
import { parseDbc } from '../services/dbcParser';

/**
 * Typed view of the moto-vehicle-defs files the analyzer reads. Everything here is
 * built from the pinned defs copy (external/moto-vehicle-defs); nothing is hard-coded
 * (Invariant 2). The builder takes the file texts so tests can feed fixtures.
 */

export interface DidDef {
  did: number;
  name: string;
  description: string;
  length: number;
  factorNum: number;
  factorDen: number;
  offset: number;
  unit: string;
  min: number;
  max: number;
  pollPeriodMs: number;
  staleAfterMs: number;
  verified: boolean;
  /** `Message.SIGNAL` on the platform bus that rt-core republishes this DID into. */
  platformSignal?: string;
}

export interface IdentificationDid {
  did: number;
  name: string;
  label: string;
  encoding: string;
}

export interface TesterPolicy {
  allowed: { sid: number; name: string; subfunctions?: number[] }[];
  forbidden: number[];
  forbiddenSubfunctions: { sid: number; subfunctions: number[] }[];
}

export interface VehicleDefs {
  vehicle: string;
  bitrate: number;
  addressing: {
    primary: { requestId: number; responseId: number; extended: boolean };
    fallback?: { requestId: number; responseId: number; extended: boolean; verified: boolean };
    functionalWatchIds: { id: number; extended: boolean }[];
  };
  paddingByte: number;
  flowControl: { flowStatus: number; blockSize: number; stMinMs: number; maxFfDl: number };
  testerPolicy: TesterPolicy;
  session: { startRequest: number[]; testerPresentRequest: number[]; testerPresentPeriodMs: number };
  timing: { responseTimeoutBaseMs: number; responseTimeoutMaxMs: number };
  dtcSnapshot?: { statusMask: number; maxDtcsPerRun: number; snapshotRecord: number; extDataRecord: number; warmIdleWindow?: string };
  dids: DidDef[];
}

export interface Iso14229Names {
  services: Map<number, string>;
  positiveResponseOffset: number;
  negativeResponseSid: number;
  suppressPosRspBit: number;
  sessions: Map<number, string>;
  readDtcSubfunctions: Map<number, string>;
  dtcStatusBits: { mask: number; name: string }[];
  nrcs: Map<number, string>;
  p2ResolutionMs: number;
  p2StarResolutionMs: number;
}

export type WindowOp = 'lt' | 'le' | 'gt' | 'ge' | 'eq';

export interface HealthWindowDef {
  key: string;
  description: string;
  opensOn: string;
  conditions: { input: string; op: WindowOp; value: number }[];
  stable: { input: string; maxSpread: number }[];
  minDurationMs: number;
  maxDurationMs: number;
  record: string;
  recordDid?: number;
  recordDescription?: string;
}

export interface CorneringLimits {
  kYellow: number;
  kRed: number;
  frictionCoeffDefault: number;
}

export interface Defs {
  /** Tag (or commit) of the pinned moto-vehicle-defs copy. */
  ref: string;
  platform: DbcCatalog;
  vehicleDbc: DbcCatalog;
  vehicle: VehicleDefs;
  identification: IdentificationDid[];
  iso: Iso14229Names;
  windows: HealthWindowDef[];
  limits: CorneringLimits;
}

export interface DefsSources {
  ref: string;
  platformDbc: string;
  vehicleDbc: string;
  vehicleYaml: string;
  obdCatalogYaml: string;
  iso14229Yaml: string;
  derivedYaml: string;
  limitsYaml: string;
}

const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`defs: ${what} is not a number`);
  return v;
};

const byteArray = (v: unknown, what: string): number[] => {
  if (!Array.isArray(v)) throw new Error(`defs: ${what} is not a list`);
  return v.map((x, i) => num(x, `${what}[${i}]`));
};

function buildVehicle(doc: any): VehicleDefs {
  const prim = doc.addressing.primary;
  const fb = doc.addressing.fallback;
  const tp = doc.tester_policy;
  return {
    vehicle: String(doc.vehicle),
    bitrate: num(doc.bus.bitrate, 'bus.bitrate'),
    addressing: {
      primary: {
        requestId: num(prim.request_id, 'primary.request_id'),
        responseId: num(prim.response_id, 'primary.response_id'),
        extended: prim.id_type === 'extended_29bit',
      },
      fallback: fb
        ? {
            requestId: num(fb.request_id, 'fallback.request_id'),
            responseId: num(fb.response_id, 'fallback.response_id'),
            extended: fb.id_type === 'extended_29bit',
            verified: fb.verified === true,
          }
        : undefined,
      functionalWatchIds: (doc.addressing.functional_watch?.ids ?? []).map((x: any) => ({
        id: num(x.id, 'functional_watch.id'),
        extended: x.id_type === 'extended_29bit',
      })),
    },
    paddingByte: num(doc.transport.padding_byte, 'transport.padding_byte'),
    flowControl: {
      flowStatus: num(doc.transport.flow_control.flow_status, 'flow_status'),
      blockSize: num(doc.transport.flow_control.block_size, 'block_size'),
      stMinMs: num(doc.transport.flow_control.st_min_ms, 'st_min_ms'),
      maxFfDl: num(doc.transport.flow_control.max_ff_dl, 'max_ff_dl'),
    },
    testerPolicy: {
      allowed: tp.allowed.map((a: any) => ({
        sid: num(a.sid, 'tester_policy.allowed.sid'),
        name: String(a.name),
        subfunctions: a.subfunctions ? byteArray(a.subfunctions, 'subfunctions') : undefined,
      })),
      forbidden: byteArray(tp.forbidden, 'tester_policy.forbidden'),
      forbiddenSubfunctions: (tp.forbidden_subfunctions ?? []).map((f: any) => ({
        sid: num(f.sid, 'forbidden_subfunctions.sid'),
        subfunctions: byteArray(f.subfunctions, 'forbidden_subfunctions.subfunctions'),
      })),
    },
    session: {
      startRequest: byteArray(doc.session.start.request, 'session.start.request'),
      testerPresentRequest: byteArray(doc.session.tester_present.request, 'session.tester_present.request'),
      testerPresentPeriodMs: num(doc.session.tester_present.period_ms, 'tester_present.period_ms'),
    },
    timing: {
      responseTimeoutBaseMs: num(doc.timing.response_timeout_base_ms, 'response_timeout_base_ms'),
      responseTimeoutMaxMs: num(doc.timing.response_timeout_max_ms, 'response_timeout_max_ms'),
    },
    dtcSnapshot: doc.dtc_snapshot
      ? {
          statusMask: num(doc.dtc_snapshot.status_mask, 'dtc_snapshot.status_mask'),
          maxDtcsPerRun: num(doc.dtc_snapshot.max_dtcs_per_run, 'dtc_snapshot.max_dtcs_per_run'),
          snapshotRecord: num(doc.dtc_snapshot.snapshot_record, 'dtc_snapshot.snapshot_record'),
          extDataRecord: num(doc.dtc_snapshot.ext_data_record, 'dtc_snapshot.ext_data_record'),
          warmIdleWindow: doc.dtc_snapshot.warm_idle_window,
        }
      : undefined,
    dids: doc.dids.map((d: any) => ({
      did: num(d.did, 'did'),
      name: String(d.name),
      description: String(d.description ?? ''),
      length: num(d.length, `${d.name}.length`),
      factorNum: num(d.factor_num, `${d.name}.factor_num`),
      factorDen: num(d.factor_den, `${d.name}.factor_den`),
      offset: num(d.offset, `${d.name}.offset`),
      unit: String(d.unit ?? ''),
      min: num(d.min, `${d.name}.min`),
      max: num(d.max, `${d.name}.max`),
      pollPeriodMs: num(d.poll_period_ms, `${d.name}.poll_period_ms`),
      staleAfterMs: num(d.stale_after_ms, `${d.name}.stale_after_ms`),
      verified: d.verified === true,
      platformSignal: d.platform_signal ?? undefined,
    })),
  };
}

function buildIso(doc: any): Iso14229Names {
  const toMap = (list: any[], key: string) => new Map<number, string>(list.map((x) => [num(x[key], key), String(x.name)]));
  return {
    services: toMap(doc.services, 'sid'),
    positiveResponseOffset: num(doc.positive_response_offset, 'positive_response_offset'),
    negativeResponseSid: num(doc.negative_response_sid, 'negative_response_sid'),
    suppressPosRspBit: num(doc.suppress_pos_rsp_bit, 'suppress_pos_rsp_bit'),
    sessions: toMap(doc.sessions, 'id'),
    readDtcSubfunctions: toMap(doc.read_dtc_subfunctions, 'id'),
    dtcStatusBits: doc.dtc_status_bits.map((b: any) => ({ mask: num(b.mask, 'mask'), name: String(b.name) })),
    nrcs: toMap(doc.nrcs, 'nrc'),
    p2ResolutionMs: num(doc.p2_resolution_ms, 'p2_resolution_ms'),
    p2StarResolutionMs: num(doc.p2_star_resolution_ms, 'p2_star_resolution_ms'),
  };
}

function buildWindows(doc: any): HealthWindowDef[] {
  const records = doc.ride_summary_records ?? {};
  return Object.entries(doc.windows ?? {}).map(([key, w]: [string, any]) => ({
    key,
    description: String(w.description ?? ''),
    opensOn: String(w.opens_on),
    conditions: (w.conditions ?? []).map((c: any) => ({ input: String(c.input), op: c.op as WindowOp, value: num(c.value, `${key}.value`) })),
    stable: (w.stable ?? []).map((s: any) => ({ input: String(s.input), maxSpread: num(s.max_spread, `${key}.max_spread`) })),
    minDurationMs: num(w.min_duration_ms, `${key}.min_duration_ms`),
    maxDurationMs: num(w.max_duration_ms, `${key}.max_duration_ms`),
    record: String(w.record),
    recordDid: records[w.record]?.did,
    recordDescription: records[w.record]?.description,
  }));
}

function buildLimits(doc: any): CorneringLimits {
  const find = (name: string): number => {
    // The limits file groups values in sections; search them for the key.
    const stack: any[] = [doc];
    while (stack.length) {
      const o = stack.pop();
      if (o && typeof o === 'object') {
        if (name in o && o[name] && typeof o[name] === 'object' && 'value' in o[name]) return num(o[name].value, name);
        Object.values(o).forEach((v) => stack.push(v));
      }
    }
    throw new Error(`defs: limits ${name} not found`);
  };
  return { kYellow: find('k_yellow'), kRed: find('k_red'), frictionCoeffDefault: find('friction_coeff_default') };
}

export function buildDefs(src: DefsSources): Defs {
  const obd = parseYaml(src.obdCatalogYaml);
  return {
    ref: src.ref,
    platform: parseDbc(src.platformDbc),
    vehicleDbc: parseDbc(src.vehicleDbc),
    vehicle: buildVehicle(parseYaml(src.vehicleYaml)),
    identification: (obd.identification ?? []).map((x: any) => ({
      did: num(x.did, 'identification.did'),
      name: String(x.name),
      label: String(x.label ?? x.name),
      encoding: String(x.encoding ?? 'ascii'),
    })),
    iso: buildIso(parseYaml(src.iso14229Yaml)),
    windows: buildWindows(parseYaml(src.derivedYaml)),
    limits: buildLimits(parseYaml(src.limitsYaml)),
  };
}

/** Physical value of a DID answer: big-endian raw * factor_num / factor_den + offset. */
export function decodeDid(def: DidDef, bytes: number[]): number | null {
  if (bytes.length < def.length) return null;
  let raw = 0;
  for (let i = 0; i < def.length; i++) raw = raw * 256 + bytes[i];
  return (raw * def.factorNum) / def.factorDen + def.offset;
}

/** Inverse of decodeDid, saturated to the DID length (simulator only). */
export function encodeDid(def: DidDef, physical: number): number[] {
  const maxRaw = 256 ** def.length - 1;
  let raw = Math.round(((physical - def.offset) * def.factorDen) / def.factorNum);
  raw = Math.max(0, Math.min(maxRaw, Number.isFinite(raw) ? raw : 0));
  const out: number[] = [];
  for (let i = def.length - 1; i >= 0; i--) {
    out[i] = raw % 256;
    raw = Math.floor(raw / 256);
  }
  return out;
}
