import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFS } from '../src/defs';
import { VirtualCanBus } from '../src/services/virtualBus';
import { parseLogFrames } from '../src/services/logIngest';
import { startLogIngest } from '../src/services/ingestClient';
import { INGEST_BATCH_SIZE } from '../src/services/ingestProtocol';
import { exportToCsv, exportToVectorAsc } from '../src/services/exportService';
import type { IngestFormat } from '../src/services/ingestProtocol';
import type { CanFrame } from '../src/types/can';

function capture(seconds: number): CanFrame[] {
  const bus = new VirtualCanBus(DEFS);
  const frames: CanFrame[] = [];
  (bus as any).onFrame = (frame: CanFrame) => frames.push(frame);
  for (let i = 0; i < seconds * 100; i++) bus.tick();
  return frames;
}

afterEach(() => vi.unstubAllGlobals());

describe('parseLogFrames', () => {
  it('returns frames in capture order', () => {
    const raw = capture(2);
    const shuffled = [...raw.slice(raw.length / 2), ...raw.slice(0, raw.length / 2)];
    const frames = parseLogFrames(exportToVectorAsc(shuffled), 'asc');
    expect(frames).toHaveLength(raw.length);
    for (let i = 1; i < frames.length; i++) expect(frames[i].timestamp).toBeGreaterThanOrEqual(frames[i - 1].timestamp);
  });
});

describe('log ingest fallback', () => {
  it.each<IngestFormat>(['asc', 'csv'])('parses %s in batches without a Worker', (format) => {
    vi.stubGlobal('Worker', undefined);
    const raw = capture(10);
    const text = format === 'asc' ? exportToVectorAsc(raw) : exportToCsv(raw);
    const expected = parseLogFrames(text, format);
    const frames: CanFrame[] = [];
    const progress: number[] = [];
    let batches = 0;
    let done = -1;
    let error = '';

    startLogIngest(
      { kind: 'parse-log', id: 1, format, text },
      {
        onProgress: (parsed) => progress.push(parsed),
        onBatch: (batch) => {
          batches += 1;
          frames.push(...batch);
        },
        onDone: (total) => {
          done = total;
        },
        onError: (message) => {
          error = message;
        },
      }
    );

    expect(error).toBe('');
    expect(done).toBe(expected.length);
    expect(frames).toEqual(expected);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(expected.length);
    expect(batches).toBe(Math.ceil(expected.length / INGEST_BATCH_SIZE));
  });
});
