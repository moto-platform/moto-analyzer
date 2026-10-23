import { ByteSnifferRecord, CanFrame, DbcMessageDef } from '../types/can';
import { Defs } from '../defs/model';
import { FramePipeline, didKey, signalKey } from '../services/pipeline';
import { UdsMonitor } from '../services/udsMonitor';
import { BusLoadMeter, frameKey } from '../services/capture';
import { updateSnifferRecord } from '../services/sniffer';

export interface BusLoad {
  loadPct: number;
  framesPerSec: number;
  peakPct: number;
}

export interface SeriesPoint {
  time: number;
  value: number;
}

export const LOG_CAPACITY = 5000;
export const HISTORY_CAPACITY = 3000;

/**
 * Everything the analyzer has captured, outside React. Sources push frames with
 * `ingest`; panels read through `useCapture` and re-render at most once per animation
 * frame (`notify` is coalesced), however fast frames arrive.
 */
export class CaptureStore {
  public readonly pipeline: FramePipeline;
  public readonly monitor: UdsMonitor;
  public framesByKey = new Map<string, CanFrame>();
  public log: CanFrame[] = [];
  public sniffer = new Map<string, ByteSnifferRecord>();
  public history = new Map<string, SeriesPoint[]>();
  public busLoad = new Map<string, BusLoad>();
  public totalRx = 0;
  public lastTime = 0;
  public customPlatformDbc: string | null = null;

  private meter = new BusLoadMeter();
  private listeners = new Set<() => void>();
  private version = 0;
  private notifyScheduled = false;
  private framesThisSecond = 0;

  constructor(public readonly defs: Defs) {
    this.pipeline = new FramePipeline(defs.platform.messages, defs.vehicleDbc.messages);
    this.monitor = new UdsMonitor(defs);
    this.monitor.onDid = (s) => {
      if (typeof s.value === 'number') this.pushPoint(didKey(s.name), s.t, s.value);
    };
  }

  public ingest(raw: CanFrame) {
    const frame = this.pipeline.process(raw);
    if (frame.bus === 'vehicle' && !frame.name) frame.name = this.udsName(frame.id);
    const key = frameKey(frame.bus, frame.id);
    this.totalRx += 1;
    this.framesThisSecond += 1;
    this.lastTime = frame.timestamp;
    this.meter.add(frame);

    const prev = this.framesByKey.get(key);
    this.framesByKey.set(key, {
      ...frame,
      prevData: prev?.data,
      changedBytes: prev ? frame.data.map((b, i) => prev.data[i] !== b) : undefined,
    });

    this.log.push(frame);
    if (this.log.length > LOG_CAPACITY) this.log.splice(0, this.log.length - LOG_CAPACITY);

    this.sniffer.set(key, updateSnifferRecord(this.sniffer.get(key), frame));

    if (frame.name && frame.decodedSignals) {
      for (const [sig, v] of Object.entries(frame.decodedSignals)) {
        if (typeof v === 'number') this.pushPoint(signalKey(frame.name, sig), frame.timestamp, v);
      }
    }

    if (frame.bus === 'vehicle' && this.monitor.isUdsId(frame.id)) this.monitor.process(frame);

    this.notify();
  }

  /** Trace names of the UDS IDs from uds/vehicle_cl250.yaml addressing. */
  private udsName(id: number): string | undefined {
    const a = this.defs.vehicle.addressing;
    if (id === a.primary.requestId) return 'UDS request (tester)';
    if (id === a.primary.responseId) return 'UDS response (ECU)';
    if (a.fallback && id === a.fallback.requestId) return 'UDS request (fallback ID)';
    if (a.fallback && id === a.fallback.responseId) return 'UDS response (fallback ID)';
    if (a.functionalWatchIds.some((w) => w.id === id)) return 'OBD functional request (2nd tester!)';
    return undefined;
  }

  private pushPoint(key: string, time: number, value: number) {
    let arr = this.history.get(key);
    if (!arr) {
      arr = [];
      this.history.set(key, arr);
    }
    arr.push({ time, value });
    if (arr.length > HISTORY_CAPACITY) arr.splice(0, arr.length - HISTORY_CAPACITY);
  }

  /** Once per second of wall time: bus load (in source time) and E2E timeouts. */
  public sampleSecond(sourceSec: number) {
    this.busLoad = new Map(this.meter.sample(sourceSec));
    this.pipeline.checkTimeouts(this.lastTime);
    this.framesThisSecond = 0;
    this.notify();
  }

  public setPlatformCatalog(messages: DbcMessageDef[], customName: string | null) {
    this.pipeline.setCatalog('platform', messages);
    this.customPlatformDbc = customName;
    this.notify();
  }

  public toggleNotch(key: string, byteIdx: number) {
    const rec = this.sniffer.get(key);
    if (!rec) return;
    const notched = [...rec.notchedBytes];
    notched[byteIdx] = !notched[byteIdx];
    this.sniffer.set(key, { ...rec, notchedBytes: notched });
    this.notify();
  }

  public invertNotch(key: string) {
    const rec = this.sniffer.get(key);
    if (!rec) return;
    this.sniffer.set(key, { ...rec, notchedBytes: rec.notchedBytes.map((n) => !n) });
    this.notify();
  }

  public clearNotches() {
    this.sniffer.forEach((rec, key) => this.sniffer.set(key, { ...rec, notchedBytes: Array(8).fill(false) }));
    this.notify();
  }

  public clear() {
    this.framesByKey = new Map();
    this.log = [];
    this.sniffer = new Map();
    this.history = new Map();
    this.busLoad = new Map();
    this.totalRx = 0;
    this.lastTime = 0;
    this.meter.reset();
    this.pipeline.reset();
    this.monitor.reset();
    this.notify();
  }

  // ------------------------------------------------------------ subscription

  public subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getVersion = () => this.version;

  /** Coalesces change notifications to one per animation frame. */
  public notify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    const run = () => {
      this.notifyScheduled = false;
      this.version++;
      this.listeners.forEach((fn) => fn());
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }
}
