/** Formats a decoded value for display: integers as-is, others with up to `digits` decimals, trailing zeros trimmed. */
export function formatValue(v: number | string | undefined | null, digits = 3): string {
  if (v === undefined || v === null) return '-';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(digits).replace(/\.?0+$/, '');
}
