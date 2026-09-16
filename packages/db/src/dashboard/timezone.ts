/**
 * Timezone-aware day/month boundaries, computed with the built-in `Intl` APIs
 * (no date library — honours the cost/dependency policy).
 *
 * A business operates in its own timezone, so "today" and "this month" for the
 * dashboard must be resolved against that zone, then expressed as absolute UTC
 * instants for the (UTC-stored) `startAt` columns. These helpers are pure and
 * unit-tested. Full availability/DST-edge handling is extended in Phase 8.
 */

/** Offset (ms) of `timeZone` from UTC at a given instant: local - UTC. */
function tzOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUTC - instant.getTime();
}

/** Local calendar parts (year/month/day) of `instant` in `timeZone`. */
function localParts(timeZone: string, instant: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Convert local wall-clock Y/M/D 00:00 in `timeZone` to the absolute instant. */
function localMidnightToInstant(timeZone: string, year: number, month: number, day: number): Date {
  const naiveUTC = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Resolve the offset at that approximate instant, then correct.
  const offset = tzOffsetMs(timeZone, new Date(naiveUTC));
  return new Date(naiveUTC - offset);
}

/** [start, end) of the local day containing `instant`, as absolute instants. */
export function localDayRange(instant: Date, timeZone: string): { start: Date; end: Date } {
  const { year, month, day } = localParts(timeZone, instant);
  const start = localMidnightToInstant(timeZone, year, month, day);
  // Add ~26h then re-snap to the next local midnight to stay DST-safe.
  const nextGuess = new Date(start.getTime() + 26 * 60 * 60 * 1000);
  const np = localParts(timeZone, nextGuess);
  const end = localMidnightToInstant(timeZone, np.year, np.month, np.day);
  return { start, end };
}

/** [start, end) of the local month containing `instant`, as absolute instants. */
export function localMonthRange(instant: Date, timeZone: string): { start: Date; end: Date } {
  const { year, month } = localParts(timeZone, instant);
  const start = localMidnightToInstant(timeZone, year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = localMidnightToInstant(timeZone, nextYear, nextMonth, 1);
  return { start, end };
}

/** Day of week in `timeZone` as 0=Sunday … 6=Saturday (matches the seed convention). */
export function localWeekday(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

/** Absolute instant of local midnight for a `YYYY-MM-DD` calendar date in `timeZone`. */
export function dateMidnightInstant(dayKey: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) throw new Error(`Invalid dayKey: ${dayKey}`);
  return localMidnightToInstant(timeZone, Number(m[1]), Number(m[2]), Number(m[3]));
}

/**
 * Wall-clock position of `instant` in `timeZone`: the local calendar day
 * (`YYYY-MM-DD`) and minutes since local midnight. Used to lay bookings onto the
 * calendar grid in the business's own timezone.
 */
export function localWallClock(instant: Date, timeZone: string): { dayKey: string; minutes: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { dayKey: `${year}-${month}-${day}`, minutes };
}

/** Minutes between two "HH:MM" wall-clock strings; 0 if malformed or negative. */
export function minutesBetween(openTime: string, closeTime: string): number {
  const toMin = (s: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const a = toMin(openTime);
  const b = toMin(closeTime);
  if (a === null || b === null) return 0;
  return Math.max(0, b - a);
}
