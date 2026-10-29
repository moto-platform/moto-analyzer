import type { CanFrame, DbcMessageDef } from '../types/can';

/** Frames per worker message; large enough to keep postMessage overhead low. */
export const INGEST_BATCH_SIZE = 2_000;

export type IngestFormat = 'asc' | 'csv';

/** Decoding catalogs sent with a parse request (defs or a custom platform DBC). */
export interface IngestCatalogs {
  platform: DbcMessageDef[];
  vehicle: DbcMessageDef[];
}

/** A whole log file handed to the worker (or to the synchronous fallback). */
export interface ParseLogRequest {
  kind: 'parse-log';
  id: number;
  format: IngestFormat;
  text: string;
  catalogs: IngestCatalogs;
}

export type IngestRequest = ParseLogRequest;

export type IngestResponse =
  | { kind: 'progress'; id: number; parsed: number; total: number }
  | { kind: 'batch'; id: number; frames: CanFrame[]; parsed: number; total: number }
  | { kind: 'done'; id: number; total: number }
  | { kind: 'error'; id: number; message: string };
