import { CanFrame, DbcMessageDef } from '../types/can';
import { decodeFrameSignals } from './dbcParser';
import { FrameTimingTracker } from './capture';
import { E2EChecker, E2EStatus, E2E_TIMEOUT_CYCLES } from './e2e';

/** History key of a decoded platform/vehicle DBC signal. */
export const signalKey = (messageName: string, signal: string) => `${messageName}.${signal}`;
/** History key of a DID value observed on the vehicle bus. */
export const didKey = (didName: string) => `DID.${didName}`;

export interface E2EMessageStats {
  id: number;
  name: string;
  status: E2EStatus;
  counts: Partial<Record<E2EStatus, number>>;
  lastT: number;
}

/**
 * Turns raw source frames into analyzer frames: timing from timestamps, decoding with
 * the catalog of the frame's bus (vehicle = cl250.dbc, platform = platform.dbc; any
 * other bus name is treated as platform), and the E2E receiver check for protected
 * platform messages.
 */
export class FramePipeline {
  private timing = new FrameTimingTracker();
  private catalogs: Record<'vehicle' | 'platform', Map<number, DbcMessageDef>>;
  private checkers = new Map<number, E2EChecker>();
  private e2eStats = new Map<number, E2EMessageStats>();

  constructor(platform: DbcMessageDef[], vehicle: DbcMessageDef[]) {
    this.catalogs = { platform: new Map(), vehicle: new Map() };
    this.setCatalog('platform', platform);
    this.setCatalog('vehicle', vehicle);
  }

  public setCatalog(bus: 'vehicle' | 'platform', messages: DbcMessageDef[]) {
    this.catalogs[bus] = new Map(messages.map((m) => [m.id, m]));
    if (bus === 'platform') {
      this.checkers.clear();
      this.e2eStats.clear();
    }
  }

  public catalog(bus: 'vehicle' | 'platform'): DbcMessageDef[] {
    return [...this.catalogs[bus].values()];
  }

  public messageFor(frame: Pick<CanFrame, 'bus' | 'id'>): DbcMessageDef | undefined {
    return (frame.bus === 'vehicle' ? this.catalogs.vehicle : this.catalogs.platform).get(frame.id);
  }

  public process(raw: CanFrame): CanFrame {
    const frame = this.timing.stamp(raw);
    const msg = this.messageFor(frame);
    frame.name = msg?.name ?? raw.name;
    frame.decodedSignals = decodeFrameSignals(frame.data, msg);

    if (msg?.e2e && frame.bus !== 'vehicle') {
      let checker = this.checkers.get(msg.id);
      if (!checker) {
        checker = new E2EChecker(msg.e2e.dataId, E2E_TIMEOUT_CYCLES * (msg.cycleTimeMs ?? 100));
        this.checkers.set(msg.id, checker);
      }
      const status = checker.check(frame.data, frame.timestamp * 1000);
      frame.e2e = status;
      const st = this.e2eStats.get(msg.id) ?? { id: msg.id, name: msg.name, status, counts: {}, lastT: frame.timestamp };
      st.status = status;
      st.lastT = frame.timestamp;
      st.counts[status] = (st.counts[status] ?? 0) + 1;
      this.e2eStats.set(msg.id, st);
    }
    return frame;
  }

  /** Marks protected messages whose timeout expired as NO_NEW_DATA (call about once per cycle). */
  public checkTimeouts(nowSec: number) {
    this.checkers.forEach((checker, id) => {
      const st = this.e2eStats.get(id);
      if (!st) return;
      const s = checker.checkTimeout(nowSec * 1000);
      if (s && st.status !== 'NO_NEW_DATA') {
        st.status = s;
        st.counts[s] = (st.counts[s] ?? 0) + 1;
      }
    });
  }

  public getE2EStats(): E2EMessageStats[] {
    return [...this.e2eStats.values()].sort((a, b) => a.id - b.id);
  }

  public reset() {
    this.timing.reset();
    this.checkers.clear();
    this.e2eStats.clear();
  }
}
