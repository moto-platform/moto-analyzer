import { Defs, HealthWindowDef, WindowOp } from '../defs/model';
import { didKey } from './pipeline';

type Series = { time: number; value: number }[];

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
export function resolveInput(defs: Defs, input: string, history: Map<string, Series>): InputSource {
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

function valueAt(s: Series | undefined, t: number): number | undefined {
  if (!s || s.length === 0 || s[0].time > t) return undefined;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return s[lo].value;
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
export function evaluateWindow(defs: Defs, w: HealthWindowDef, history: Map<string, Series>, now: number): WindowState {
  const conditions: ConditionState[] = w.conditions.map((c) => {
    const input = resolveInput(defs, c.input, history);
    const series = input.key ? history.get(input.key) : undefined;
    const value = valueAt(series, now);
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
    const pts = (series ?? []).filter((p) => p.time >= windowStart && p.time <= now);
    if (pts.length < 2) return { input, maxSpread: s.maxSpread, holds: null };
    const vals = pts.map((p) => p.value);
    const spread = Math.max(...vals) - Math.min(...vals);
    return { input, maxSpread: s.maxSpread, spread, holds: spread <= s.maxSpread };
  });

  const all = [...conditions.map((c) => c.holds), ...stable.map((s) => s.holds)];
  // A window without conditions is opened by its event alone: nothing to evaluate here.
  const conditionsHold = all.length === 0 || all.some((h) => h === null) ? null : all.every(Boolean);

  // Walk back over the samples of the observable condition inputs to find when a condition last failed.
  let heldForSec = 0;
  const observable = w.conditions.map((c, i) => ({ c, src: conditions[i].input })).filter((x) => x.src.key !== null);
  if (conditionsHold !== false && observable.length > 0 && conditions.every((c) => c.holds !== false)) {
    const times = new Set<number>();
    observable.forEach(({ src }) => (history.get(src.key!) ?? []).forEach((p) => p.time <= now && times.add(p.time)));
    const sorted = [...times].sort((a, b) => b - a);
    let earliest = now;
    for (const t of sorted) {
      const ok = observable.every(({ c, src }) => {
        const v = valueAt(history.get(src.key!), t);
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
