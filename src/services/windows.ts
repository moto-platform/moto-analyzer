import { Defs, HealthWindowDef, WindowOp } from '../defs/model';
import { didKey } from './pipeline';
import { SeriesLike, lowerBound, sampleAt } from '../state/ring';

type History = Map<string, SeriesLike>;

export interface InputSource {
  /** History key used, or null when the analyzer cannot observe the input. */
  key: string | null;
  label: string;
  note?: string;
}

/**
 * Where the analyzer can see a window input: a DID answer on the vehicle bus
 * (`DID.NAME`), else the platform signal rt-core republishes it into. Derived signals
 * and sensors (`derived.*`, `sensor.*`) are computed on rt-core and not observable.
 */
export function resolveInput(defs: Defs, input: string, history: History): InputSource {
  const [kind, name] = input.split('.', 2);
  if (kind === 'did') {
    const k = didKey(name);
    if ((history.get(k)?.length ?? 0) > 0) return { key: k, label: input };
    const ps = defs.vehicle.dids.find((d) => d.name === name)?.platformSignal;
    if (ps && (history.get(ps)?.length ?? 0) > 0) return { key: ps, label: input, note: `via ${ps}` };
    return { key: k, label: input };
  }
  return { key: null, label: input, note: kind === 'derived' ? 'derived signal, computed on rt-core' : 'sensor input of rt-core' };
}

export const OP_TEXT: Record<WindowOp, string> = { lt: '<', le: '≤', gt: '>', ge: '≥', eq: '=' };

export function compare(op: WindowOp, a: number, b: number): boolean {
  switch (op) {
    case 'lt':
      return a < b;
    case 'le':
      return a <= b;
    case 'gt':
      return a > b;
    case 'ge':
      return a >= b;
    case 'eq':
      return Math.abs(a - b) < 1e-6;
  }
}

export interface ConditionState {
  input: InputSource;
  text: string;
  value?: number;
  /** true / false, or null when the input is not observable or has no value yet. */
  holds: boolean | null;
}

export interface StableState {
  input: InputSource;
  maxSpread: number;
  spread?: number;
  holds: boolean | null;
}

export interface WindowState {
  def: HealthWindowDef;
  conditions: ConditionState[];
  stable: StableState[];
  /** All conditions observable and true now. */
  conditionsHold: boolean | null;
  /** How long the observable conditions have held without a break, in seconds. */
  heldForSec: number;
  /** Conditions held for at least min_duration (only meaningful for opens_on: condition). */
  qualified: boolean;
}

/** Evaluates a window's entry conditions on the captured series at time `now` (seconds). */
export function evaluateWindow(defs: Defs, w: HealthWindowDef, history: History, now: number): WindowState {
  const conditions: ConditionState[] = w.conditions.map((c) => {
    const input = resolveInput(defs, c.input, history);
    const series = input.key ? history.get(input.key) : undefined;
    const value = sampleAt(series, now);
    return {
      input,
      text: `${c.input} ${OP_TEXT[c.op]} ${c.value}`,
      value,
      holds: value === undefined ? null : compare(c.op, value, c.value),
    };
  });

  const windowStart = now - w.minDurationMs / 1000;
  const stable: StableState[] = w.stable.map((s) => {
    const input = resolveInput(defs, s.input, history);
    const series = input.key ? history.get(input.key) : undefined;
    let lo = Infinity;
    let hi = -Infinity;
    let n = 0;
    if (series) {
      for (let i = lowerBound(series, windowStart); i < series.length && series.timeAt(i) <= now; i++, n++) {
        const v = series.valueAt(i);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (n < 2) return { input, maxSpread: s.maxSpread, holds: null };
    const spread = hi - lo;
    return { input, maxSpread: s.maxSpread, spread, holds: spread <= s.maxSpread };
  });

  const all = [...conditions.map((c) => c.holds), ...stable.map((s) => s.holds)];
  // A window without conditions is opened by its event alone: nothing to evaluate here.
  const conditionsHold = all.length === 0 || all.some((h) => h === null) ? null : all.every(Boolean);

  // Walk back over the samples of the observable condition inputs to find when a condition last failed.
  let heldForSec = 0;
  const observable = w.conditions.map((c, i) => ({ c, src: conditions[i].input })).filter((x) => x.src.key !== null);
  if (conditionsHold !== false && observable.length > 0 && conditions.every((c) => c.holds !== false)) {
    // Sample times of the inputs within max_duration before now, newest first.
    const from = now - w.maxDurationMs / 1000;
    const times = new Set<number>();
    observable.forEach(({ src }) => {
      const s = history.get(src.key!);
      if (!s) return;
      for (let i = lowerBound(s, from); i < s.length && s.timeAt(i) <= now; i++) times.add(s.timeAt(i));
    });
    const sorted = [...times].sort((a, b) => b - a);
    let earliest = now;
    for (const t of sorted) {
      const ok = observable.every(({ c, src }) => {
        const v = sampleAt(history.get(src.key!), t);
        return v !== undefined && compare(c.op, v, c.value);
      });
      if (!ok) break;
      earliest = t;
    }
    heldForSec = now - earliest;
  }

  return {
    def: w,
    conditions,
    stable,
    conditionsHold,
    heldForSec,
    qualified: conditionsHold === true && heldForSec * 1000 >= w.minDurationMs,
  };
}
