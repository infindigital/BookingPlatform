import { Prisma, type BookingStatus, type PrismaClient } from '@prisma/client';
import { ValidationError, canTransition } from '@booking/core';
import { prisma } from '../client';

export interface BookingTransition {
  id: string;
  from: BookingStatus;
  to: BookingStatus;
}

/**
 * Transition a booking using the core state machine as the single guard.
 * Tenant-scoped and transactional: the current status is read and validated
 * against `canTransition` before the write, so no illegal or self transition can
 * be persisted (concurrent double-decisions collapse — the second sees the new
 * status and is rejected).
 *
 * Phase 12/13: enqueue a NotificationJob for the state change where marked.
 */
export async function transitionBooking(
  businessId: string,
  bookingId: string,
  to: BookingStatus,
  db: PrismaClient = prisma,
): Promise<BookingTransition> {
  if (!businessId) throw new Error('transitionBooking requires a businessId.');
  if (!bookingId) throw new ValidationError('A booking id is required.');

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });
    if (!booking) throw new ValidationError('Booking not found.');

    if (!canTransition(booking.status, to)) {
      throw new ValidationError(
        `A ${booking.status.toLowerCase()} booking cannot be changed to ${to.toLowerCase()}.`,
      );
    }

    await tx.booking.update({ where: { id: booking.id }, data: { status: to } });

    // Phase 12/13: enqueue a NotificationJob for the state change here.

    return { id: booking.id, from: booking.status, to };
  });
}

/**
 * Minimal, guarded booking status transition used by the dashboard's
 * pending-approval actions (approve / reject).
 *
 * Scope for this phase is deliberately narrow and real (no fake mutation):
 *  - the booking is loaded and verified to belong to `businessId` (tenant isolation);
 *  - the change is only applied when the current status is in `allowedFrom`,
 *    so an already-decided booking cannot be re-approved/flipped;
 *  - the read + guard + write run in one transaction to avoid races.
 *
 * The FULL booking state machine (every legal transition, capacity/reschedule
 * rules, and notification-job enqueue on state change) is Phase 7. This function
 * is forward-compatible with that: callers pass the allowed source states, and
 * the notification hook slots in where marked below.
 */
export async function setBookingStatus(
  businessId: string,
  bookingId: string,
  next: BookingStatus,
  allowedFrom: BookingStatus[],
  db: PrismaClient = prisma,
): Promise<BookingTransition> {
  if (!businessId) throw new Error('setBookingStatus requires a businessId.');
  if (!bookingId) throw new ValidationError('A booking id is required.');

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true },
    });

    if (!booking) {
      throw new ValidationError('Booking not found.');
    }
    if (booking.status === next) {
      throw new ValidationError(`This booking is already ${next.toLowerCase()}.`);
    }
    if (!allowedFrom.includes(booking.status)) {
      throw new ValidationError(
        `A ${booking.status.toLowerCase()} booking cannot be changed to ${next.toLowerCase()}.`,
      );
    }

    await tx.booking.update({ where: { id: booking.id }, data: { status: next } });

    // Phase 12/13: enqueue a NotificationJob for the state change here.

    return { id: booking.id, from: booking.status, to: next };
  });
}
