import { Prisma, type BookingStatus, type PrismaClient } from '@prisma/client';
import { BookingConflictError, ValidationError, isValidInterval } from '@booking/core';
import { SLOT_OCCUPYING_STATUSES } from '@booking/core';
import { prisma } from '../client';
import { forUpdateByIdAndBusiness } from '../dialect';

export interface CreateBookingInput {
  businessId: string;
  customerId: string;
  serviceId: string;
  employeeId?: string | null;
  locationId?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string;
  priceTotal?: Prisma.Decimal | number | string;
  currency?: string;
  notes?: string | null;
  source?: string | null;
  status?: BookingStatus;
}

type TxClient = Prisma.TransactionClient;

/**
 * Transaction-safe booking creation with double-booking prevention.
 *
 * Concurrency strategy (portable across PostgreSQL and MySQL/InnoDB):
 * when the booking is assigned to a specific employee we take a `FOR UPDATE`
 * row lock on that Employee row inside the transaction. This serialises all
 * concurrent booking attempts for the same employee, so the overlap check below
 * always observes previously-committed bookings and exactly one of two racing
 * requests can win. Terminal statuses (cancelled/rejected/etc.) free the slot.
 *
 * NOTE: the raw lock query is the single dialect-specific statement in the data
 * layer (Postgres identifier quoting shown). The MySQL variant uses backticks;
 * it is swapped when the datasource provider changes. Phase 8 extends this with
 * capacity, buffers, working-hours, time-off and holiday checks.
 */
export async function createBooking(
  input: CreateBookingInput,
  db: PrismaClient = prisma,
): Promise<{ id: string }> {
  if (!isValidInterval({ start: input.startAt, end: input.endAt })) {
    throw new ValidationError('Booking end time must be after its start time.');
  }

  return db.$transaction(async (tx: TxClient) => {
    if (input.employeeId) {
      // Serialise concurrent bookings for this employee (portable row lock).
      await tx.$queryRawUnsafe(forUpdateByIdAndBusiness('Employee'), input.employeeId, input.businessId);

      const conflicts = await tx.booking.findMany({
        where: {
          businessId: input.businessId,
          employeeId: input.employeeId,
          status: { in: SLOT_OCCUPYING_STATUSES as BookingStatus[] },
          startAt: { lt: input.endAt },
          endAt: { gt: input.startAt },
        },
        select: { id: true },
      });

      if (conflicts.length > 0) {
        throw new BookingConflictError();
      }
    }

    const booking = await tx.booking.create({
      data: {
        businessId: input.businessId,
        customerId: input.customerId,
        serviceId: input.serviceId,
        employeeId: input.employeeId ?? null,
        locationId: input.locationId ?? null,
        status: input.status ?? 'PENDING',
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone ?? 'UTC',
        priceTotal: input.priceTotal ?? 0,
        currency: input.currency ?? 'USD',
        notes: input.notes ?? null,
        source: input.source ?? null,
      },
      select: { id: true },
    });

    return booking;
  });
}
