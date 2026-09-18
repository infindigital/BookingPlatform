import type { PrismaClient } from '@prisma/client';
import { referenceFor } from '../public/reference';

/**
 * Build the stable public JSON payload for a booking webhook. This is the
 * contract external consumers integrate against, so it is deliberately flat and
 * decoupled from internal column names. Times are ISO-8601 UTC.
 */
export interface WebhookBookingData {
  id: string;
  reference: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  price: number;
  currency: string;
  service: { id: string; name: string };
  employee: { id: string; name: string } | null;
  customer: { firstName: string; lastName: string; email: string | null; phone: string | null };
}

export interface WebhookEnvelope {
  id: string; // delivery id
  event: string;
  createdAt: string;
  businessId: string;
  data: { booking: WebhookBookingData };
}

export async function buildBookingWebhookData(
  businessId: string,
  bookingId: string,
  db: PrismaClient,
): Promise<WebhookBookingData | null> {
  const b = await db.booking.findFirst({
    where: { id: bookingId, businessId },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      timezone: true,
      priceTotal: true,
      currency: true,
      service: { select: { id: true, name: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
      customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
  });
  if (!b) return null;

  return {
    id: b.id,
    reference: referenceFor(b.id),
    status: b.status,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    timezone: b.timezone,
    price: Number(b.priceTotal),
    currency: b.currency,
    service: { id: b.service.id, name: b.service.name },
    employee: b.employee ? { id: b.employee.id, name: `${b.employee.firstName} ${b.employee.lastName}`.trim() } : null,
    customer: {
      firstName: b.customer.firstName ?? '',
      lastName: b.customer.lastName ?? '',
      email: b.customer.email ?? null,
      phone: b.customer.phone ?? null,
    },
  };
}

/** Serialize the full envelope a receiver gets (delivery id + event + data). */
export function buildEnvelopeBody(envelope: WebhookEnvelope): string {
  return JSON.stringify(envelope);
}
