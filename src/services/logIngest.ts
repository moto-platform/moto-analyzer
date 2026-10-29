import type { CanFrame } from '../types/can';
import { parseCanCsv, parseVectorAsc } from './logParser';
import { INGEST_BATCH_SIZE, type IngestResponse, type ParseLogRequest } from './ingestProtocol';

/** Parses a log and returns its frames in capture order. */
export function parseLogFrames(text: string, format: ParseLogRequest['format']): CanFrame[] {
  const frames = format === 'asc' ? parseVectorAsc(text) : parseCanCsv(text);
  return frames.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Parses one log, emitting progress and frame batches. The same function runs in the worker
 * and in the main-thread fallback, so both paths produce identical frames. Decoding, timing
 * and E2E stay in CaptureStore, which sees the frames through the replay transport.
 */
export function runLogIngest(request: ParseLogRequest, emit: (message: IngestResponse) => void): void {
  const frames = parseLogFrames(request.text, request.format);
  const total = frames.length;
  emit({ kind: 'progress', id: request.id, parsed: 0, total });

  for (let start = 0; start < total; start += INGEST_BATCH_SIZE) {
    const batch = frames.slice(start, start + INGEST_BATCH_SIZE);
    const parsed = start + batch.length;
    emit({ kind: 'batch', id: request.id, frames: batch, parsed, total });
    emit({ kind: 'progress', id: request.id, parsed, total });
  }
  emit({ kind: 'done', id: request.id, total });
}
