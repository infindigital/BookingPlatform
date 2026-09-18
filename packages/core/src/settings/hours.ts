/**
 * Weekly business-hours domain — pure and dependency-free.
 *
 * Business hours are stored as "HH:mm" wall-clock strings per weekday. These
 * helpers parse/validate them, normalise a raw set into a canonical 7-day week
 * for the editor, and build the constraint the availability engine applies as an
 * outer boundary on each employee's bookable windows.
 */

export const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface DayHours {
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  isClosed: boolean;
  /** "HH:mm" wall-clock. */
  openTime: string;
  /** "HH:mm" wall-clock. */
  closeTime: string;
}

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '17:00';

/** Parse "HH:mm" to minutes since midnight, or null if malformed. Allows 24:00. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return h * 60 + min;
}

/** Minutes since midnight → zero-padded "HH:mm" (clamped to 0..1440). */
export function minutesToHHMM(mins: number): string {
  const v = Math.max(0, Math.min(1440, Math.round(Number.isFinite(mins) ? mins : 0)));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isValidHHMM(value: string | null | undefined): boolean {
  return parseHHMM(value) !== null;
}

/**
 * Normalise raw rows into a canonical Sunday→Saturday week for the editor.
 * Missing days default to closed; a day whose window is malformed or non-positive
 * is repaired to the default 09:00–17:00 (still respecting an explicit closed
 * flag). The last row for a given day wins.
 */
export function resolveWeeklyHours(rows: Partial<DayHours>[] | null | undefined): DayHours[] {
  const byDay = new Map<number, Partial<DayHours>>();
  for (const row of rows ?? []) {
    if (typeof row?.dayOfWeek !== 'number') continue;
    const d = Math.trunc(row.dayOfWeek);
    if (d < 0 || d > 6) continue;
    byDay.set(d, row);
  }

  const week: DayHours[] = [];
  for (let d = 0; d < 7; d++) {
    const raw = byDay.get(d);
    if (!raw) {
      week.push({ dayOfWeek: d, isClosed: true, openTime: DEFAULT_OPEN, closeTime: DEFAULT_CLOSE });
      continue;
    }
    const open = parseHHMM(raw.openTime);
    const close = parseHHMM(raw.closeTime);
    const valid = open !== null && close !== null && close > open;
    week.push({
      dayOfWeek: d,
      isClosed: raw.isClosed === true,
      openTime: valid ? minutesToHHMM(open) : DEFAULT_OPEN,
      closeTime: valid ? minutesToHHMM(close) : DEFAULT_CLOSE,
    });
  }
  return week;
}

/**
 * Only the rows worth persisting: an open day with a valid window, or an
 * explicitly closed day. (A closed day is still stored so it constrains the
 * engine; days with neither are simply absent = unconstrained.)
 */
export function toStorableHours(week: DayHours[]): DayHours[] {
  const out: DayHours[] = [];
  for (const day of week) {
    if (day.isClosed) {
      out.push({ dayOfWeek: day.dayOfWeek, isClosed: true, openTime: day.openTime, closeTime: day.closeTime });
      continue;
    }
    const open = parseHHMM(day.openTime);
    const close = parseHHMM(day.closeTime);
    if (open === null || close === null || close <= open) continue;
    out.push({
      dayOfWeek: day.dayOfWeek,
      isClosed: false,
      openTime: minutesToHHMM(open),
      closeTime: minutesToHHMM(close),
    });
  }
  return out;
}

export interface DayWindow {
  /** Minutes since midnight. */
  open: number;
  /** Minutes since midnight. */
  close: number;
}

/**
 * The outer-boundary constraint the availability engine applies. Days not
 * present in either collection are unconstrained (employee hours alone decide).
 */
export interface BusinessHoursConstraint {
  /** True when any usable business-hours row exists. */
  hasAny: boolean;
  /** Open windows (minutes) for days that have at least one valid open row. */
  windowsByDay: Map<number, DayWindow[]>;
  /** Weekdays explicitly marked closed (and with no valid open window). */
  closedDays: Set<number>;
}

/**
 * Build the constraint from raw stored rows. Multiple open rows for a day are
 * kept as separate windows (split hours). A closed row marks the day closed
 * unless the same day also has a valid open window (open wins).
 */
export function buildBusinessHoursConstraint(
  rows: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[] | null | undefined,
): BusinessHoursConstraint {
  const windowsByDay = new Map<number, DayWindow[]>();
  const seen = new Set<number>();
  for (const row of rows ?? []) {
    const d = Math.trunc(row.dayOfWeek);
    if (d < 0 || d > 6) continue;
    seen.add(d);
    if (row.isClosed) continue;
    const open = parseHHMM(row.openTime);
    const close = parseHHMM(row.closeTime);
    if (open === null || close === null || close <= open) continue;
    const arr = windowsByDay.get(d) ?? [];
    arr.push({ open, close });
    windowsByDay.set(d, arr);
  }
  const closedDays = new Set<number>();
  for (const d of seen) if (!windowsByDay.has(d)) closedDays.add(d);
  return { hasAny: seen.size > 0, windowsByDay, closedDays };
}
