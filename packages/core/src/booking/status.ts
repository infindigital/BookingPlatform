/**
 * Canonical booking + payment state definitions (framework-free).
 *
 * These constants are the single source of truth for the domain. The Prisma
 * schema mirrors these enum values; keep the two in sync (a test asserts parity
 * once the db package is wired). Transition validation (the full state machine)
 * lands in Phase 7 — here we define the states and which ones occupy a time slot.
 */

export const BOOKING_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'RESCHEDULED',
  'COMPLETED',
  'NO_SHOW',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Human-readable labels for each booking status. */
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
};

export const PAYMENT_STATUSES = [
  'UNPAID',
  'PENDING',
  'PAID',
  'PARTIALLY_PAID',
  'REFUNDED',
  'FAILED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Statuses that actively occupy a time slot and therefore participate in
 * double-booking / availability conflict checks. Terminal/negative statuses
 * (REJECTED, CANCELLED, COMPLETED, NO_SHOW) free the slot.
 */
export const SLOT_OCCUPYING_STATUSES: readonly BookingStatus[] = [
  'PENDING',
  'ACCEPTED',
  'RESCHEDULED',
] as const;

export function occupiesSlot(status: BookingStatus): boolean {
  return SLOT_OCCUPYING_STATUSES.includes(status);
}
