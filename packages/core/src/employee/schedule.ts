/**
 * Employee schedule domain (pure, UI-independent).
 *
 * Weekly working hours are the backbone of availability: each weekday can have a
 * single working window (start → end) with any number of breaks carved out of it.
 * These helpers validate and measure that structure so both the data layer and
 * the admin UI agree on what a legal schedule is, without either owning the rules.
 */

/** Days of the week, index 0 = Sunday .. 6 = Saturday (matches `Date.getDay`). */
export const WEEKDAYS: readonly { value: number; label: string; short: string }[] = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

export interface ScheduleBreak {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  label?: string | null;
}

export interface WorkingWindow {
  dayOfWeek: number; // 0..6
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  breaks: ScheduleBreak[];
}

/** Parse "HH:mm" into minutes-from-midnight, or null if malformed / out of range. */
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isValidHhMm(value: string): boolean {
  return parseHhMm(value) !== null;
}

/** Render minutes-from-midnight back to a zero-padded "HH:mm". */
export function formatHhMm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate a single working window and its breaks:
 * - start and end are well-formed and end is strictly after start;
 * - each break is well-formed, end after start, and fully inside the window;
 * - breaks do not overlap one another.
 */
export function validateWorkingWindow(window: {
  startTime: string;
  endTime: string;
  breaks: ScheduleBreak[];
}): ValidationResult {
  const start = parseHhMm(window.startTime);
  const end = parseHhMm(window.endTime);
  if (start === null || end === null) return { ok: false, error: 'Enter valid start and end times.' };
  if (end <= start) return { ok: false, error: 'The end time must be after the start time.' };

  const intervals: { s: number; e: number }[] = [];
  for (const br of window.breaks) {
    const bs = parseHhMm(br.startTime);
    const be = parseHhMm(br.endTime);
    if (bs === null || be === null) return { ok: false, error: 'Enter valid break times.' };
    if (be <= bs) return { ok: false, error: 'A break must end after it starts.' };
    if (bs < start || be > end) return { ok: false, error: 'Breaks must fall within working hours.' };
    intervals.push({ s: bs, e: be });
  }
  intervals.sort((a, b) => a.s - b.s);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i]!.s < intervals[i - 1]!.e) return { ok: false, error: 'Breaks must not overlap.' };
  }
  return { ok: true };
}

/** Net working minutes in one window (window length minus its breaks). */
export function windowWorkingMinutes(window: {
  startTime: string;
  endTime: string;
  breaks: ScheduleBreak[];
}): number {
  const start = parseHhMm(window.startTime);
  const end = parseHhMm(window.endTime);
  if (start === null || end === null || end <= start) return 0;
  let mins = end - start;
  for (const br of window.breaks) {
    const bs = parseHhMm(br.startTime);
    const be = parseHhMm(br.endTime);
    if (bs !== null && be !== null && be > bs) mins -= be - bs;
  }
  return Math.max(0, mins);
}

/** Total net working minutes across a set of weekday windows. */
export function weeklyWorkingMinutes(windows: WorkingWindow[]): number {
  return windows.reduce((sum, w) => sum + windowWorkingMinutes(w), 0);
}

/**
 * Validate a full weekly schedule; the first offending day short-circuits.
 * A weekday may hold several working blocks (the gaps between them act as
 * breaks), so blocks on the same day must not overlap one another.
 */
export function validateWeeklySchedule(windows: WorkingWindow[]): ValidationResult {
  const byDay = new Map<number, { s: number; e: number }[]>();
  for (const w of windows) {
    if (w.dayOfWeek < 0 || w.dayOfWeek > 6) return { ok: false, error: 'Invalid day of week.' };
    const res = validateWorkingWindow(w);
    if (!res.ok) {
      const day = WEEKDAYS.find((d) => d.value === w.dayOfWeek)?.label ?? 'A day';
      return { ok: false, error: `${day}: ${res.error}` };
    }
    const spans = byDay.get(w.dayOfWeek) ?? [];
    spans.push({ s: parseHhMm(w.startTime)!, e: parseHhMm(w.endTime)! });
    byDay.set(w.dayOfWeek, spans);
  }
  for (const [dayOfWeek, spans] of byDay) {
    spans.sort((a, b) => a.s - b.s);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]!.s < spans[i - 1]!.e) {
        const day = WEEKDAYS.find((d) => d.value === dayOfWeek)?.label ?? 'A day';
        return { ok: false, error: `${day}: time blocks must not overlap.` };
      }
    }
  }
  return { ok: true };
}
