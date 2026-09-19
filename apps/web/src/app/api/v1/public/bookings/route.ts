import { createPublicBooking } from '@booking/db';
import { DomainError, BookingConflictError } from '@booking/core';
import { guardPublicRequest, apiOk, apiError, preflight } from '@/lib/public-api';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/v1/public/bookings
 *
 * Creates a customer-initiated booking. Nothing from the body is trusted: the
 * business is re-resolved from the key, the service re-checked, and the slot
 * re-validated against the live availability engine before the transaction-safe
 * `createBooking` primitive (per-employee `FOR UPDATE` lock) writes it - so two
 * visitors racing for the last slot cannot both win. Public bookings are created
 * PENDING (awaiting admin approval).
 *
 * Body: { serviceId, employeeId?, locationId?, dayKey, time, firstName, lastName, email, phone?, notes?, customerAddress? }
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const guard = await guardPublicRequest(request, url, 'write');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  // Reject oversized payloads before reading them (a booking is a few short
  // fields; anything large is abuse). Guard both the declared and actual size.
  const MAX_BODY = 8 * 1024;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return apiError('Request body too large.', 413, ctx.origin, ctx.website.domain);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return apiError('Unable to read request body.', 400, ctx.origin, ctx.website.domain);
  }
  if (raw.length > MAX_BODY) {
    return apiError('Request body too large.', 413, ctx.origin, ctx.website.domain);
  }

  let body: Record<string, unknown>;
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return apiError('Request body must be valid JSON.', 400, ctx.origin, ctx.website.domain);
  }

  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const serviceId = str(body.serviceId);
  if (!serviceId) return apiError('serviceId is required.', 400, ctx.origin, ctx.website.domain);

  try {
    const confirmation = await createPublicBooking({
      slug: ctx.website.slug,
      serviceId,
      employeeId: str(body.employeeId) || null,
      locationId: str(body.locationId) || null,
      dayKey: str(body.dayKey),
      time: str(body.time),
      customer: {
        firstName: str(body.firstName),
        lastName: str(body.lastName),
        email: str(body.email),
        phone: str(body.phone) || null,
      },
      notes: str(body.notes) || null,
      customerAddress: str(body.customerAddress) || null,
    });
    return apiOk({ booking: confirmation }, ctx, 201);
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return apiError(error.message, 409, ctx.origin, ctx.website.domain, 'conflict');
    }
    if (error instanceof DomainError) {
      return apiError(error.message, 400, ctx.origin, ctx.website.domain, error.code);
    }
    logger.error('public.booking.failed', { key: ctx.website.websiteId, message: (error as Error)?.message });
    return apiError('Unable to create the booking. Please try again.', 500, ctx.origin, ctx.website.domain);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
