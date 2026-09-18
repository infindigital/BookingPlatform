import type { PrismaClient } from '@prisma/client';
import { referenceFor } from '../public/reference';

/**
 * Resolve the template variables (and recipient contacts) for a booking. Dates
 * are formatted in the business timezone via `Intl` — no date library, per the
 * cost policy. Returns null when the booking cannot be found for the tenant.
 */

export interface BookingNotificationContext {
  vars: Record<string, string>;
  recipientEmail: string | null;
  recipientPhone: string | null;
  startAt: Date;
  status: string;
}

export async function buildBookingContext(
  businessId: string,
  bookingId: string,
  db: PrismaClient,
): Promise<BookingNotificationContext | null> {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, businessId },
    select: {
      id: true,
      startAt: true,
      status: true,
      priceTotal: true,
      currency: true,
      timezone: true,
      customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      service: { select: { name: true } },
      employee: { select: { firstName: true, lastName: true } },
      business: { select: { name: true, timezone: true } },
    },
  });
  if (!booking) return null;

  const timeZone = booking.timezone || booking.business.timezone || 'UTC';
  const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });

  let price = `${booking.currency} ${Number(booking.priceTotal).toFixed(2)}`;
  try {
    price = new Intl.NumberFormat('en-US', { style: 'currency', currency: booking.currency }).format(Number(booking.priceTotal));
  } catch {
    // keep the fallback
  }

  const firstName = booking.customer.firstName ?? '';
  const lastName = booking.customer.lastName ?? '';
  const employeeName = booking.employee ? `${booking.employee.firstName} ${booking.employee.lastName}`.trim() : 'our team';

  const vars: Record<string, string> = {
    'customer.firstName': firstName,
    'customer.lastName': lastName,
    'customer.name': `${firstName} ${lastName}`.trim(),
    'business.name': booking.business.name,
    'service.name': booking.service.name,
    'booking.date': dateFmt.format(booking.startAt),
    'booking.time': timeFmt.format(booking.startAt),
    'booking.reference': referenceFor(booking.id),
    'booking.employee': employeeName,
    'booking.price': price,
  };

  return {
    vars,
    recipientEmail: booking.customer.email ?? null,
    recipientPhone: booking.customer.phone ?? null,
    startAt: booking.startAt,
    status: booking.status,
  };
}
