import type { PrismaClient } from '@prisma/client';
import { computeAmountDue } from '@booking/core';
import { prisma } from '../client';
import { loadPaymentSettings } from './settings';
import { PaymentRepository } from './payment.repository';
import { DEFAULT_PAYMENT_PROVIDER } from './provider';

export interface EnsureBookingPaymentInput {
  price: number;
  currency: string;
}

/**
 * Create the Payment record for a freshly-created booking, per the business's
 * payment policy. The amount owed is computed on the backend from the service
 * price — the client never supplies it. When the policy requires nothing
 * (NONE, or a free service), no payment row is created. Idempotent.
 */
export async function ensurePaymentForBooking(
  businessId: string,
  bookingId: string,
  input: EnsureBookingPaymentInput,
  db: PrismaClient = prisma,
): Promise<{ amountDue: number } | null> {
  const settings = await loadPaymentSettings(businessId, db);
  const due = computeAmountDue(input.price, settings);
  if (due.amountDue <= 0) return null;

  const repo = new PaymentRepository(businessId, db);
  await repo.ensureForBooking({
    bookingId,
    amountDue: due.amountDue,
    currency: input.currency || settings.currency,
    provider: DEFAULT_PAYMENT_PROVIDER,
  });
  return { amountDue: due.amountDue };
}
