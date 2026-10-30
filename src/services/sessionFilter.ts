import type { SessionRow } from './sessionClient';

/** Filter and sort state of the recorded-session list (roadmap A3). */
export type SessionSort = 'newest' | 'loss';

export interface SessionFilter {
  /** Case-insensitive substring of the session id. */
  text: string;
  /** Selected statuses; empty means every status. Values come from the loaded rows. */
  statuses: string[];
  /** ISO date or timestamp; date-only covers the whole UTC day. */
  from: string;
  /** ISO date or timestamp; date-only covers the whole UTC day. */
  to: string;
  sort: SessionSort;
}

export const SESSION_FILTER_STORAGE_KEY = 'vehicle-analyzer.session-filter.v1';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONED = /(?:z|[+-]\d{2}:?\d{2})$/i;
const DAY_MS = 86_400_000;

export function defaultSessionFilter(): SessionFilter {
  return { text: '', statuses: [], from: '', to: '', sort: 'newest' };
}

/** Parses an ISO 8601 date or timestamp as UTC. Date-only covers the whole UTC day. */
export function parseUtcBound(value: string, end: boolean): number | null {
  const text = value.trim();
  if (text === '') return null;

  const date = DATE_ONLY.exec(text);
  if (date) {
    const year = Number(date[1]);
    const month = Number(date[2]);
    const day = Number(date[3]);
    const start = Date.UTC(year, month - 1, day);
    const parsed = new Date(start);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      return null;
    }
    return end ? start + DAY_MS - 1 : start;
  }

  const millis = Date.parse(ZONED.test(text) ? text : `${text}Z`);
  return Number.isFinite(millis) ? millis : null;
}

function createdMs(row: SessionRow): number | null {
  return typeof row.created_utc === 'string' ? parseUtcBound(row.created_utc, false) : null;
}

function lossPercent(row: SessionRow): number | null {
  const value = row.loss_percent;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function byNewest(a: SessionRow, b: SessionRow): number {
  const am = createdMs(a);
  const bm = createdMs(b);
  if (am === null && bm === null) return a.session_id.localeCompare(b.session_id);
  if (am === null) return 1;
  if (bm === null) return -1;
  return bm - am || a.session_id.localeCompare(b.session_id);
}

function byLoss(a: SessionRow, b: SessionRow): number {
  const al = lossPercent(a);
  const bl = lossPercent(b);
  if (al === null && bl === null) return byNewest(a, b);
  if (al === null) return 1;
  if (bl === null) return -1;
  return bl - al || byNewest(a, b);
}

/** Status values that occur in the loaded list, without assuming a fixed vocabulary. */
export function sessionStatuses(rows: readonly SessionRow[]): string[] {
  const statuses = new Set<string>();
  for (const row of rows) {
    if (typeof row.status === 'string' && row.status !== '') statuses.add(row.status);
  }
  return [...statuses].sort((a, b) => a.localeCompare(b));
}

/** Pure filter/sort step; the input order and objects are not mutated. */
export function filterSessions(rows: readonly SessionRow[], filter: SessionFilter): SessionRow[] {
  const text = filter.text.trim().toLowerCase();
  const statuses = new Set(filter.statuses);
  const from = parseUtcBound(filter.from, false);
  const to = parseUtcBound(filter.to, true);

  const visible = rows.filter((row) => {
    if (text !== '' && !row.session_id.toLowerCase().includes(text)) return false;
    if (statuses.size > 0 && (typeof row.status !== 'string' || !statuses.has(row.status))) return false;
    if (from !== null || to !== null) {
      const created = createdMs(row);
      if (created === null) return false;
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
    }
    return true;
  });

  return visible.sort(filter.sort === 'loss' ? byLoss : byNewest);
}

function parseFilter(raw: unknown): SessionFilter {
  const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const statuses = Array.isArray(record.statuses)
    ? record.statuses.filter((value): value is string => typeof value === 'string' && value !== '')
    : [];
  return {
    text: typeof record.text === 'string' ? record.text : '',
    statuses,
    from: typeof record.from === 'string' ? record.from : '',
    to: typeof record.to === 'string' ? record.to : '',
    sort: record.sort === 'loss' ? 'loss' : 'newest',
  };
}

interface FilterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrNull(storage?: FilterStorage): FilterStorage | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Loads the remembered filter; a broken or unavailable storage falls back to defaults. */
export function loadSessionFilter(storage?: FilterStorage): SessionFilter {
  const target = storageOrNull(storage);
  if (!target) return defaultSessionFilter();
  try {
    const raw = target.getItem(SESSION_FILTER_STORAGE_KEY);
    return raw === null ? defaultSessionFilter() : parseFilter(JSON.parse(raw));
  } catch {
    return defaultSessionFilter();
  }
}

/** Remembers the filter for this viewer; storage errors are ignored. */
export function saveSessionFilter(filter: SessionFilter, storage?: FilterStorage): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(SESSION_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // localStorage can be disabled or full; the filter still works for this view.
  }
}
