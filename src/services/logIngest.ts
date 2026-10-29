import type { CanFrame } from '../types/can';
import { decodeFrameSignals } from './dbcParser';
import { parseCanCsv, parseVectorAsc } from './logParser';
import { INGEST_BATCH_SIZE, type IngestCatalogs, type IngestResponse, type ParseLogRequest } from './ingestProtocol';

/** Parses a log and returns its frames in capture order. */
export function parseLogFrames(text: string, format: ParseLogRequest['format']): CanFrame[] {
  const frames = format === 'asc' ? parseVectorAsc(text) : parseCanCsv(text);
  return frames.sort((a, b) => a.timestamp - b.timestamp);
}

/** Stateless decode with the same catalogs the main thread uses. Timing and E2E stay in CaptureStore. */
export function decodeLogFrames(frames: CanFrame[], catalogs: IngestCatalogs): CanFrame[] {
  const platform = new Map(catalogs.platform.map((message) => [message.id, message]));
  const vehicle = new Map(catalogs.vehicle.map((message) => [message.id, message]));

  return frames.map((frame) => {
    const message = (frame.bus === 'vehicle' ? vehicle : platform).get(frame.id);
    return {
      ...frame,
      name: message?.name,
      decodedSignals: decodeFrameSignals(frame.data, message),
    };
  });
}

/**
 * Parses and decodes one log, emitting progress and frame batches. The same function runs
 * in the worker and in the main-thread fallback, so both paths produce identical frames.
 */
export function runLogIngest(request: ParseLogRequest, emit: (message: IngestResponse) => void): void {
  const frames = decodeLogFrames(parseLogFrames(request.text, request.format), request.catalogs);
  const total = frames.length;
  emit({ kind: 'progress', id: request.id, parsed: 0, total });

  let batch: CanFrame[] = [];
  let parsed = 0;
  for (const frame of frames) {
    batch.push(frame);
    parsed++;
    if (batch.length >= INGEST_BATCH_SIZE) {
      emit({ kind: 'batch', id: request.id, frames: batch, parsed, total });
      emit({ kind: 'progress', id: request.id, parsed, total });
      batch = [];
    }
  }
  if (batch.length > 0) {
    emit({ kind: 'batch', id: request.id, frames: batch, parsed, total });
    emit({ kind: 'progress', id: request.id, parsed, total });
  }
  emit({ kind: 'done', id: request.id, total });
}
