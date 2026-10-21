export interface CanFrame {
  id: number;
  idHex: string;
  bus: string;
  dlc: number;
  data: number[];
  timestamp: number;
  deltaMs: number;
  isExtended: boolean;
  periodMs: number;
  frequencyHz: number;
  count: number;
  name?: string;
  decodedSignals?: Record<string, number | string>;
  prevData?: number[];
  changedBytes?: boolean[];
}

export interface DecodedSignal {
  name: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  timestamp: number;
  frameId: number;
}

export interface BusStats {
  busLoadPct: number;
  msgPerSec: number;
  errorFrames: number;
  totalRx: number;
  uptimeSec: number;
}

export type ByteActivityStatus = 'static' | 'inc' | 'dec' | 'toggling';

export interface ByteSnifferRecord {
  id: number;
  idHex: string;
  name?: string;
  dlc: number;
  currentBytes: number[];
  prevBytes: number[];
  byteStatuses: ByteActivityStatus[];
  changeCounts: number[];
  notchedBytes: boolean[]; // When true, changes on this byte are ignored
  lastUpdated: number;
  frameHistory: { timestamp: number; data: number[] }[];
  bitFlips: number[]; // 64 bit flip counters
}

export interface DtcRecord {
  code: string;
  description: string;
  statusMask: number;
  active: boolean;
  pending: boolean;
  confirmed: boolean;
  freezeFrame?: Record<string, string | number>;
}

export interface DbcSignalDef {
  name: string;
  startBit: number;
  bitLength: number;
  isLittleEndian: boolean;
  isSigned: boolean;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  comment?: string;
}

export interface DbcMessageDef {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  signals: DbcSignalDef[];
}

export type CockpitTab = 'trace' | 'sniffer' | 'oscilloscope' | 'uds' | 'health' | 'cluster' | 'sync';
export type TraceMode = 'overwrite' | 'scroll';
export type TelemetrySource = 'virtual' | 'local_file' | 'websocket' | 'webserial';
