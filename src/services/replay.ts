import { CanFrame } from '../types/can';

/** One step of the replay transport: a CAN frame of a log or a recorded sample of a session. */
export type ReplayItem =
  | { kind: 'frame'; t: number; frame: CanFrame }
  | { kind: 'sample'; t: number; key: string; value: number };

export const framesToItems = (frames: CanFrame[]): ReplayItem[] => frames.map((frame) => ({ kind: 'frame', t: frame.timestamp, frame }));

/** Merges per-key series (seconds, each non-decreasing) into one time-ordered item list (stable per key order on ties). */
export function mergeSamples(series: { key: string; t: number[]; v: number[] }[]): ReplayItem[] {
  const items: ReplayItem[] = [];
  for (const s of series) {
    const n = Math.min(s.t.length, s.v.length);
    for (let i = 0; i < n; i++) items.push({ kind: 'sample', t: s.t[i], key: s.key, value: s.v[i] });
  }
  // Array.prototype.sort is stable: equal times keep the series order.
  return items.sort((a, b) => a.t - b.t);
}
