/**
 * Event domain - pure and dependency-free. Validates event input and computes
 * seat capacity. The data layer enforces capacity transactionally on top of
 * these rules; this module is the single source of truth for what's valid and
 * how many seats are left.
 */

import { ValidationError } from '../errors';
import { isValidInterval } from '../booking/overlap';
import { normalizeCurrency, clampMoney } from '../payments/money';
import { EVENT_STATUSES, SEAT_OCCUPYING_STATUSES, type EventStatus, type EventRegistrationStatus } from './status';

export interface EventInput {
  title?: string | null;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  capacity?: number | null;
  price?: number | null;
  currency?: string | null;
  locationId?: string | null;
  employeeId?: string | null;
  status?: EventStatus | null;
}

export interface ResolvedEvent {
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  capacity: number;
  price: number;
  currency: string;
  locationId: string | null;
  employeeId: string | null;
  status: EventStatus;
}

const MAX_CAPACITY = 100_000;

/** Validate + normalise event input. Throws ValidationError on bad data. */
export function resolveEventInput(input: EventInput): ResolvedEvent {
  const title = (input.title ?? '').trim();
  if (!title) throw new ValidationError('An event title is required.');
  if (title.length > 200) throw new ValidationError('The event title is too long.');

  if (!(input.startAt instanceof Date) || Number.isNaN(input.startAt.getTime())) {
    throw new ValidationError('A valid start time is required.');
  }
  if (!(input.endAt instanceof Date) || Number.isNaN(input.endAt.getTime())) {
    throw new ValidationError('A valid end time is required.');
  }
  if (!isValidInterval({ start: input.startAt, end: input.endAt })) {
    throw new ValidationError('The event must end after it starts.');
  }

  const rawCapacity = input.capacity ?? 0;
  if (!Number.isFinite(rawCapacity) || rawCapacity < 0) throw new ValidationError('Capacity cannot be negative.');
  const capacity = Math.min(MAX_CAPACITY, Math.floor(rawCapacity));

  const status: EventStatus = input.status && EVENT_STATUSES.includes(input.status) ? input.status : 'DRAFT';

  const description = (input.description ?? '').trim();

  return {
    title: title.slice(0, 200),
    description: description ? description.slice(0, 5000) : null,
    startAt: input.startAt,
    endAt: input.endAt,
    capacity,
    price: clampMoney(input.price ?? 0, 0),
    currency: normalizeCurrency(input.currency),
    locationId: input.locationId ?? null,
    employeeId: input.employeeId ?? null,
    status,
  };
}

/** Sum the seats consumed by a set of registrations (occupying statuses only). */
export function occupiedSeats(registrations: { seats: number; status: EventRegistrationStatus }[]): number {
  let total = 0;
  for (const r of registrations) {
    if (SEAT_OCCUPYING_STATUSES.includes(r.status)) total += Math.max(0, Math.floor(r.seats));
  }
  return total;
}

/** Seats still available (never negative). */
export function seatsRemaining(capacity: number, occupied: number): number {
  return Math.max(0, Math.floor(capacity) - Math.max(0, Math.floor(occupied)));
}

/** Whether `seats` more can be registered without exceeding capacity. */
export function canRegister(capacity: number, occupied: number, seats: number): boolean {
  const want = Math.floor(seats);
  if (want <= 0) return false;
  return want <= seatsRemaining(capacity, occupied);
}

export function isSoldOut(capacity: number, occupied: number): boolean {
  return seatsRemaining(capacity, occupied) <= 0;
}
