import { CanFrame } from '../types/can';

/** Nominal bit rate of both buses: classic CAN 500 kbit/s (D-009, D-019). */
export const CAN_BITRATE = 500_000;

export const frameKey = (bus: string, id: number) => `${bus}:${id}`;

/**
 * Bits a classic CAN data frame occupies on the wire, without stuff bits:
 * 11-bit ID: 44 + 8*DLC, 29-bit ID: 64 + 8*DLC, plus 3 bits of interframe space.
 * Stuff bits add up to ~20 % more; the load is therefore a lower bound.
 */
export function frameBits(dlc: number, isExtended: boolean): number {
  const n = Math.max(0, Math.min(8, dlc));
  return (isExtended ? 64 : 44) + 8 * n + 3;
}

/**
 * Fills in the timing fields of incoming frames from their own timestamps:
 * deltaMs = time since the previous frame on the same bus, periodMs = time since the
 * previous frame with the same bus and ID, frequencyHz = smoothed 1000 / period,
 * count = frames seen with that bus and ID. Sources only supply the timestamp.
 */
export class FrameTimingTracker {
  private lastByKey = new Map<string, { t: number; count: number; periodMs: number }>();
  private lastByBus = new Map<string, number>();

  public stamp(frame: CanFrame): CanFrame {
    const key = frameKey(frame.bus, frame.id);
    const t = frame.timestamp;

    const lastBus = this.lastByBus.get(frame.bus);
    const deltaMs = lastBus === undefined ? 0 : Math.max(0, (t - lastBus) * 1000);
    this.lastByBus.set(frame.bus, t);

    const prev = this.lastByKey.get(key);
    let periodMs = 0;
    let count = 1;
    if (prev) {
      const raw = Math.max(0, (t - prev.t) * 1000);
      // Exponential smoothing keeps the column readable with jittery sources.
      periodMs = prev.periodMs > 0 ? prev.periodMs * 0.8 + raw * 0.2 : raw;
      count = prev.count + 1;
    }
    this.lastByKey.set(key, { t, count, periodMs });

    return {
      ...frame,
      deltaMs,
      periodMs,
      frequencyHz: periodMs > 0 ? 1000 / periodMs : 0,
      count,
    };
  }

  public reset() {
    this.lastByKey.clear();
    this.lastByBus.clear();
  }
}

/** Accumulates wire bits per bus and reports the load over the last sample interval. */
export class BusLoadMeter {
  private bits = new Map<string, number>();
  private frames = new Map<string, number>();
  private peak = new Map<string, number>();

  public add(frame: CanFrame) {
    this.bits.set(frame.bus, (this.bits.get(frame.bus) ?? 0) + frameBits(frame.dlc, frame.isExtended));
    this.frames.set(frame.bus, (this.frames.get(frame.bus) ?? 0) + 1);
  }

  /**
   * Returns per-bus load in percent and frames per second over `intervalSec` (time of
   * the source, so a 2x replay shows the recorded load, not twice of it), then resets.
   */
  public sample(intervalSec: number): Map<string, { loadPct: number; framesPerSec: number; peakPct: number }> {
    const out = new Map<string, { loadPct: number; framesPerSec: number; peakPct: number }>();
    if (intervalSec <= 0) return out;
    const buses = new Set([...this.bits.keys(), ...this.peak.keys()]);
    buses.forEach((bus) => {
      const loadPct = ((this.bits.get(bus) ?? 0) / intervalSec / CAN_BITRATE) * 100;
      const peakPct = Math.max(this.peak.get(bus) ?? 0, loadPct);
      this.peak.set(bus, peakPct);
      out.set(bus, { loadPct, framesPerSec: (this.frames.get(bus) ?? 0) / intervalSec, peakPct });
    });
    this.bits.clear();
    this.frames.clear();
    return out;
  }

  public reset() {
    this.bits.clear();
    this.frames.clear();
    this.peak.clear();
  }
}
