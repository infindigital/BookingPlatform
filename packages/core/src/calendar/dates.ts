/**
 * Pure calendar-date helpers operating on `YYYY-MM-DD` keys. These are civil
 * dates (no timezone): arithmetic uses UTC purely as a stable calendar, never as
 * a wall-clock. Timezone-aware instant math lives in the data layer.
 */

export function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function keyFromUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toNoonUTC(key: string): Date {
  const { y, m, d } = parseDayKey(key);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseDayKey(key);
  return keyFromUTC(new Date(Date.UTC(y, m - 1, d + n)));
}

/** 0 = Sunday … 6 = Saturday for a civil date. */
export function weekdayOf(key: string): number {
  const { y, m, d } = parseDayKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The seven day-keys of the Monday-based week containing `key`. */
export function weekDays(key: string): string[] {
  const wd = weekdayOf(key); // 0..6, Sun..Sat
  const backToMonday = (wd + 6) % 7; // days since Monday
  const monday = addDays(key, -backToMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** N day-keys starting at `key` (used by the agenda view). */
export function rangeDays(key: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(key, i));
}
