import { Prisma, type PrismaClient } from '@prisma/client';
import { BookingConflictError, ValidationError, isValidInterval, isReschedulable, SLOT_OCCUPYING_STATUSES } from '@booking/core';
import type { BookingStatus } from '@prisma/client';
import { prisma } from '../client';

export interface RescheduleInput {
  startAt: Date;
  endAt: Date;
  /** Optionally reassign to a different employee (or null to unassign). */
  employeeId?: string | null;
}

export interface RescheduleResult {
  id: string;
  from: BookingStatus;
  to: BookingStatus;
}

/**
 * Move a booking to a new time and/or employee, re-validating against
 * double-booking. Tenant-scoped and transactional; when the (new) employee is
 * set we take the same `FOR UPDATE` row lock used on create and check for
 * overlaps, excluding this booking itself. On success the status becomes
 * RESCHEDULED (the booking then awaits re-confirmation via the state machine).
 *
 * The raw lock statement is the one dialect-specific query (Postgres quoting
 * shown; MySQL uses backticks) — mirrors create-booking.ts.
 */
export async function rescheduleBooking(
  businessId: string,
  bookingId: string,
  input: RescheduleInput,
  db: PrismaClient = prisma,
): Promise<RescheduleResult> {
  if (!businessId) throw new Error('rescheduleBooking requires a businessId.');
  if (!isValidInterval({ start: input.startAt, end: input.endAt })) {
    throw new ValidationError('Booking end time must be after its start time.');
  }

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, businessId },
      select: { id: true, status: true, employeeId: true },
    });
    if (!booking) throw new ValidationError('Booking not found.');
    if (!isReschedulable(booking.status)) {
      throw new ValidationError(`A ${booking.status.toLowerCase()} booking cannot be rescheduled.`);
    }

    const targetEmployeeId =
      input.employeeId === undefined ? booking.employeeId : input.employeeId;

    if (targetEmployeeId) {
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${targetEmployeeId} AND "businessId" = ${businessId} FOR UPDATE`;

      const conflicts = await tx.booking.findMany({
        where: {
          businessId,
          employeeId: targetEmployeeId,
          id: { not: booking.id },
          status: { in: SLOT_OCCUPYING_STATUSES as BookingStatus[] },
          startAt: { lt: input.endAt },
          endAt: { gt: input.startAt },
        },
        select: { id: true },
      });
      if (conflicts.length > 0) throw new BookingConflictError();
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        startAt: input.startAt,
        endAt: input.endAt,
        ...(input.employeeId === undefined ? {} : { employeeId: input.employeeId }),
        status: 'RESCHEDULED',
      },
    });

    // Phase 12/13: enqueue a BOOKING_RESCHEDULED NotificationJob here.

    return { id: booking.id, from: booking.status, to: 'RESCHEDULED' as BookingStatus };
  });
}
