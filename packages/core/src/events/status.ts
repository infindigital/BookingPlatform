/** Event + registration state definitions (framework-free). Mirrors the Prisma enums. */

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export const EVENT_REGISTRATION_STATUSES = ['REGISTERED', 'CANCELLED', 'ATTENDED', 'NO_SHOW'] as const;
export type EventRegistrationStatus = (typeof EVENT_REGISTRATION_STATUSES)[number];

export const EVENT_REGISTRATION_STATUS_LABELS: Record<EventRegistrationStatus, string> = {
  REGISTERED: 'Registered',
  CANCELLED: 'Cancelled',
  ATTENDED: 'Attended',
  NO_SHOW: 'No-show',
};

/**
 * Registration statuses that consume a seat. A cancelled or no-show registration
 * frees its seat; a registered or attended one holds it. This is the single
 * source of truth for capacity accounting.
 */
export const SEAT_OCCUPYING_STATUSES: readonly EventRegistrationStatus[] = ['REGISTERED', 'ATTENDED'] as const;

export function occupiesSeat(status: EventRegistrationStatus): boolean {
  return SEAT_OCCUPYING_STATUSES.includes(status);
}
