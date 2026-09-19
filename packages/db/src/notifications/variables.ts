import type { PrismaClient } from '@prisma/client';
import { referenceFor } from '../public/reference';

/**
 * Base URL for customer-facing links (magic-link "manage booking"). Server-side
 * only; falls back to localhost for dev. Trailing slash trimmed.
 */
function appBaseUrl(): string {
  const raw = process.env.APP_URL?.trim() || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * Build the magic-link URL to the public manage page, pre-filling the customer's
 * email + booking reference. Both are things the recipient already holds (the mail
 * is sent to that address, and the reference is on their confirmation), so this is
 * a convenience link, not a bearer secret - every action still re-verifies the
 * (email, reference) pair server-side.
 */
function manageUrlFor(slug: string, email: string | null, reference: string): string | null {
  if (!slug) return null;
  const params = new URLSearchParams({ ref: reference });
  if (email) params.set('email', email);
  return `${appBaseUrl()}/book/${encodeURIComponent(slug)}/manage?${params.toString()}`;
}

/**
 * Resolve the template variables (and recipient contacts) for a booking. Dates
 * are formatted in the business timezone via `Intl` - no date library, per the
 * cost policy. Returns null when the booking cannot be found for the tenant.
 */

export interface BookingNotificationContext {
  vars: Record<string, string>;
  recipientEmail: string | null;
  recipientPhone: string | null;
  /** Business display name - used to brand the HTML email shell. */
  businessName: string;
  /** Magic-link to the public manage page (email + reference pre-filled), or null. */
  manageUrl: string | null;
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
      customerAddress: true,
      customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      service: { select: { name: true } },
      employee: { select: { firstName: true, lastName: true } },
      business: { select: { name: true, timezone: true, slug: true } },
      location: {
        select: {
          name: true,
          mode: true,
          address: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          mapUrl: true,
        },
      },
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
  const reference = referenceFor(booking.id);
  const recipientEmail = booking.customer.email ?? null;
  const manageUrl = manageUrlFor(booking.business.slug, recipientEmail, reference);

  // Location: for a mobile ("we come to you") location the relevant address is
  // the customer's own; otherwise it is the venue's full address.
  const loc = booking.location;
  const customerAddress = booking.customerAddress?.trim() ?? '';
  const venueAddress = loc
    ? [
        loc.address,
        [[loc.city, loc.state].filter(Boolean).join(', '), loc.postalCode].filter(Boolean).join(' ').trim(),
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  const locationName = loc?.name ?? '';
  const address = loc?.mode === 'MOBILE' ? customerAddress : venueAddress;
  const mapUrl = loc?.mode === 'MOBILE' ? '' : loc?.mapUrl ?? '';

  const vars: Record<string, string> = {
    'customer.firstName': firstName,
    'customer.lastName': lastName,
    'customer.name': `${firstName} ${lastName}`.trim(),
    'business.name': booking.business.name,
    'service.name': booking.service.name,
    'booking.date': dateFmt.format(booking.startAt),
    'booking.time': timeFmt.format(booking.startAt),
    'booking.reference': reference,
    'booking.employee': employeeName,
    'booking.price': price,
    'booking.manageUrl': manageUrl ?? '',
    'booking.location': locationName,
    'booking.address': address,
    'booking.mapUrl': mapUrl,
    'booking.customerAddress': customerAddress,
  };

  return {
    vars,
    recipientEmail,
    recipientPhone: booking.customer.phone ?? null,
    businessName: booking.business.name,
    manageUrl,
    startAt: booking.startAt,
    status: booking.status,
  };
}
