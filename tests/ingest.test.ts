import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFS } from '../src/defs';
import { VirtualCanBus } from '../src/services/virtualBus';
import { CaptureStore } from '../src/state/captureStore';
import { decodeLogFrames, parseLogFrames } from '../src/services/logIngest';
import { startLogIngest } from '../src/services/ingestClient';
import { INGEST_BATCH_SIZE } from '../src/services/ingestProtocol';
import { exportToCsv, exportToVectorAsc } from '../src/services/exportService';
import type { IngestCatalogs, IngestFormat } from '../src/services/ingestProtocol';
import type { CanFrame } from '../src/types/can';

function capture(seconds: number): CanFrame[] {
  const bus = new VirtualCanBus(DEFS);
  const frames: CanFrame[] = [];
  (bus as any).onFrame = (frame: CanFrame) => frames.push(frame);
  for (let i = 0; i < seconds * 100; i++) bus.tick();
  return frames;
}

const cloneFrames = (frames: CanFrame[]): CanFrame[] =>
  frames.map((frame) => ({ ...frame, data: [...frame.data] }));

const catalogs: IngestCatalogs = {
  platform: DEFS.platform.messages,
  vehicle: DEFS.vehicleDbc.messages,
};

function snapshot(store: CaptureStore) {
  return {
    totalRx: store.totalRx,
    dataVersion: store.dataVersion,
    lastTime: store.lastTime,
    log: store.log.toArray(),
    framesByKey: [...store.framesByKey.entries()].sort(([a], [b]) => a.localeCompare(b)),
    history: [...store.history.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ring]) => [key, ring.toArray()]),
    e2e: store.pipeline.getE2EStats(),
    busLoad: [...store.busLoad.entries()].sort(([a], [b]) => a.localeCompare(b)),
    monitor: {
      transactions: store.monitor.getTransactions(),
      dids: store.monitor.getDids(),
      dtcs: store.monitor.getDtcs(),
      alerts: store.monitor.getAlerts(),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('CaptureStore.ingestBatch', () => {
  it('matches per-frame ingest for frames, history, E2E and the UDS monitor', () => {
    const raw = capture(10);
    const batchStore = new CaptureStore(DEFS);
    const singleStore = new CaptureStore(DEFS);
    batchStore.notify = () => undefined;
    singleStore.notify = () => undefined;

    batchStore.ingestBatch(cloneFrames(raw));
    for (const frame of cloneFrames(raw)) singleStore.ingest(frame);
    batchStore.sampleSecond(10);
    singleStore.sampleSecond(10);

    expect(snapshot(batchStore)).toEqual(snapshot(singleStore));
  });

  it('notifies once per batch and ignores an empty batch', () => {
    const frames = capture(2);
    const store = new CaptureStore(DEFS);
    let notes = 0;
    store.notify = () => {
      notes += 1;
    };

    store.ingestBatch(frames);
    expect(notes).toBe(1);
    store.ingestBatch([]);
    expect(notes).toBe(1);
    expect(store.totalRx).toBe(frames.length);
  });

  it('uses worker-decoded frames without decoding again', () => {
    const asc = exportToVectorAsc(capture(10));
    const parsed = parseLogFrames(asc, 'asc');
    const decoded = decodeLogFrames(parsed, catalogs);

    const workerStore = new CaptureStore(DEFS);
    const parsedStore = new CaptureStore(DEFS);
    workerStore.notify = () => undefined;
    parsedStore.notify = () => undefined;
    workerStore.ingestBatch(decoded);
    parsedStore.ingestBatch(cloneFrames(parsed));

    expect(snapshot(workerStore)).toEqual(snapshot(parsedStore));
  });
});

describe('log ingest fallback', () => {
  it.each<IngestFormat>(['asc', 'csv'])('parses %s in batches without a Worker', (format) => {
    vi.stubGlobal('Worker', undefined);
    const raw = capture(10);
    const text = format === 'asc' ? exportToVectorAsc(raw) : exportToCsv(raw);
    const expected = decodeLogFrames(parseLogFrames(text, format), catalogs);
    const frames: CanFrame[] = [];
    const progress: number[] = [];
    let batches = 0;
    let done = -1;
    let error = '';

    startLogIngest(
      { kind: 'parse-log', id: 1, format, text, catalogs },
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
