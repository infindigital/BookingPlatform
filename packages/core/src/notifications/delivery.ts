/**
 * Delivery policy (pure): retry backoff and reminder scheduling. These rules are
 * shared by the DB-backed queue dispatcher so retry timing is testable in
 * isolation and independent of any transport.
 */

/** Default lead time before an appointment for the reminder notification. */
export const DEFAULT_REMINDER_LEAD_MINUTES = 24 * 60;

const MINUTE_MS = 60_000;

/**
 * Exponential backoff for a failed job, by the number of attempts already made.
 * attempt 1 → 1m, 2 → 5m, 3 → 15m, 4 → 60m, then capped at 6h.
 */
export function retryDelayMs(attempts: number): number {
  const steps = [1, 5, 15, 60, 180, 360];
  const idx = Math.min(Math.max(attempts, 1), steps.length) - 1;
  return steps[idx]! * MINUTE_MS;
}

/** Next retry timestamp for a job that just failed on its Nth attempt. */
export function nextRetryAt(attempts: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + retryDelayMs(attempts));
}

/** Whether a job that just failed on its Nth attempt should be retried again. */
export function shouldRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts;
}

/** When the reminder for a booking starting at `startAt` should be sent. */
export function reminderScheduledAt(startAt: Date, leadMinutes: number = DEFAULT_REMINDER_LEAD_MINUTES): Date {
  return new Date(startAt.getTime() - leadMinutes * MINUTE_MS);
}
