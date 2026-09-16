import type { BookingStatus } from './status';

/**
 * Booking status state machine (framework-free, the single source of truth for
 * which status changes are legal). The dashboard, calendar and bookings screen
 * all drive their controls from this, and the data layer asserts against it
 * before persisting — so no illegal transition can be written.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'RESCHEDULED'],
  ACCEPTED: ['CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED'],
  RESCHEDULED: ['ACCEPTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};

/** Whether a booking may move directly from `from` to `to`. */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return from !== to && BOOKING_TRANSITIONS[from].includes(to);
}

/** The statuses reachable from `from`. */
export function nextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return BOOKING_TRANSITIONS[from];
}

/** A terminal status has no outgoing transitions. */
export function isTerminal(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0;
}

/**
 * Whether a booking's time/employee can be changed. Rescheduling is allowed while
 * the booking still occupies a slot; the operation itself sets status RESCHEDULED.
 */
export function isReschedulable(status: BookingStatus): boolean {
  return status === 'PENDING' || status === 'ACCEPTED' || status === 'RESCHEDULED';
}

export type BookingActionKey = 'approve' | 'reject' | 'complete' | 'no_show' | 'cancel';

export interface BookingActionDef {
  key: BookingActionKey;
  label: string;
  target: BookingStatus;
  tone: 'primary' | 'destructive' | 'default';
  /** Permission required to perform this action. */
  permission: string;
}

/**
 * Semantic actions offered in the UI, each mapping to a target status. Approvals
 * require `booking.approve`; other lifecycle changes require `booking.write`.
 */
export const BOOKING_ACTIONS: readonly BookingActionDef[] = [
  { key: 'approve', label: 'Approve', target: 'ACCEPTED', tone: 'primary', permission: 'booking.approve' },
  { key: 'reject', label: 'Reject', target: 'REJECTED', tone: 'destructive', permission: 'booking.approve' },
  { key: 'complete', label: 'Mark completed', target: 'COMPLETED', tone: 'primary', permission: 'booking.write' },
  { key: 'no_show', label: 'Mark no-show', target: 'NO_SHOW', tone: 'default', permission: 'booking.write' },
  { key: 'cancel', label: 'Cancel', target: 'CANCELLED', tone: 'destructive', permission: 'booking.write' },
];

/** Actions that are legal from the given status (before permission filtering). */
export function availableActions(status: BookingStatus): BookingActionDef[] {
  return BOOKING_ACTIONS.filter((a) => canTransition(status, a.target));
}

export function actionByKey(key: string): BookingActionDef | undefined {
  return BOOKING_ACTIONS.find((a) => a.key === key);
}
