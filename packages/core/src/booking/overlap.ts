/**
 * Pure time-interval logic used by the availability and double-booking engine.
 * No I/O, no framework — trivially unit-testable and reused by the db layer.
 *
 * Intervals are treated as half-open [start, end): a booking ending exactly when
 * another begins does NOT conflict (back-to-back bookings are allowed).
 */

export interface Interval {
  start: Date;
  end: Date;
}

export function isValidInterval({ start, end }: Interval): boolean {
  return start.getTime() < end.getTime();
}

/** True when two half-open intervals share any positive-length overlap. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** True when `candidate` overlaps any interval in `existing`. */
export function hasConflict(candidate: Interval, existing: readonly Interval[]): boolean {
  return existing.some((slot) => intervalsOverlap(candidate, slot));
}
