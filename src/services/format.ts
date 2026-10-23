import type { DbcSignalDef } from '../types/can';

/** Formats a decoded value for display: integers as-is, others with up to `digits` decimals, trailing zeros trimmed. */
export function formatValue(v: number | string | undefined | null, digits = 3): string {
  if (v === undefined || v === null) return '-';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(digits).replace(/\.?0+$/, '');
}


/** Value-table name for enum signals (e.g. NODE_MODE 1 -> NORMAL), else the formatted number. */
export function formatSignal(sig: DbcSignalDef | undefined, v: number | string | undefined | null): string {
  if (typeof v === 'number' && sig?.values) {
    const raw = Math.round((v - sig.offset) / sig.factor);
    const name = sig.values[raw];
    if (name !== undefined) return name;
  }
  return formatValue(v);
}

export const hexId = (id: number, extended: boolean) => `0x${id.toString(16).toUpperCase().padStart(extended ? 8 : 3, '0')}`;
