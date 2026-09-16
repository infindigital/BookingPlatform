import { describe, it, expect } from 'vitest';
import { BookingStatus as PrismaBookingStatus, PaymentStatus as PrismaPaymentStatus } from '@prisma/client';
import { BOOKING_STATUSES, PAYMENT_STATUSES } from '@booking/core';

/** Guards that the framework-free domain constants stay in sync with the schema. */
describe('enum parity: @booking/core ↔ Prisma schema', () => {
  it('booking statuses match', () => {
    expect([...BOOKING_STATUSES].sort()).toEqual(Object.values(PrismaBookingStatus).sort());
  });

  it('payment statuses match', () => {
    expect([...PAYMENT_STATUSES].sort()).toEqual(Object.values(PrismaPaymentStatus).sort());
  });
});
