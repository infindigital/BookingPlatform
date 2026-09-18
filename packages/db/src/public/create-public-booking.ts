import type { PrismaClient } from '@prisma/client';
import { ValidationError, BookingConflictError } from '@booking/core';
import { prisma } from '../client';
import { repositoriesFor } from '../repositories/index';
import { wallTimeToInstant } from '../dashboard/timezone';
import { getAvailability } from '../availability/availability';
import { loadResolvedForm } from '../form/config';
import { writeAudit } from '../audit';

/**
 * Public (customer-initiated) booking creation.
 *
 * Nothing here trusts the client: the business is resolved by slug, the service
 * is re-checked, and the requested time is re-validated against the live
 * availability engine (working hours, breaks, existing bookings, time-off,
 * blocks, holidays). For an unspecified team member we pick one the engine
 * reports as free for that exact slot. The final write goes through the
 * transaction-safe `createBooking` primitive (per-employee `FOR UPDATE` lock),
 * so two visitors racing for the same slot cannot both win.
 *
 * Public bookings are created PENDING — they await admin approval.
 */

export interface PublicBookingCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

export interface CreatePublicBookingInput {
  slug: string;
  serviceId: string;
  employeeId?: string | null;
  /** Local calendar day in the business timezone, "YYYY-MM-DD". */
  dayKey: string;
  /** Local wall-clock start in the business timezone, "HH:MM" (24h). */
  time: string;
  customer: PublicBookingCustomer;
  notes?: string | null;
}

export interface PublicBookingConfirmation {
  id: string;
  reference: string;
  status: string;
  startISO: string;
  endISO: string;
  serviceName: string;
  employeeName: string | null;
  businessName: string;
  timezone: string;
  currency: string;
  price: number;
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Short, human-friendly reference derived from the booking id (display only). */
function referenceFor(id: string): string {
  return id.slice(-8).toUpperCase();
}

export async function createPublicBooking(
  input: CreatePublicBookingInput,
  db: PrismaClient = prisma,
): Promise<PublicBookingConfirmation> {
  const email = input.customer.email.trim().toLowerCase();
  const firstName = input.customer.firstName.trim();
  const lastName = input.customer.lastName.trim();
  if (!firstName || !email) throw new ValidationError('Please provide your name and email.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Please provide a valid email address.');

  const minutes = parseHHMM(input.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey) || minutes === null) {
    throw new ValidationError('Please choose a valid date and time.');
  }

  const business = await db.business.findUnique({
    where: { slug: input.slug },
    select: { id: true, name: true, timezone: true, currency: true },
  });
  if (!business) throw new ValidationError('This booking page is unavailable.');
  const businessId = business.id;
  const timeZone = business.timezone || 'UTC';

  const service = await db.service.findFirst({
    where: { id: input.serviceId, businessId, isActive: true },
    select: { id: true, name: true, durationMinutes: true, price: true },
  });
  if (!service) throw new ValidationError('That service is no longer available.');

  const startAt = wallTimeToInstant(input.dayKey, minutes, timeZone);
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  // Re-validate the requested slot against the live availability engine, applying
  // the business's own min-lead policy so a tampered client cannot book inside it.
  const { settings } = await loadResolvedForm(businessId, db);
  const availability = await getAvailability(
    businessId,
    {
      serviceId: service.id,
      employeeId: input.employeeId ?? null,
      fromDayKey: input.dayKey,
      toDayKey: input.dayKey,
      timeZone,
      now: new Date(),
      minLeadMinutes: settings.minLeadMinutes,
    },
    db,
  );
  const day = availability.days.find((d) => d.dayKey === input.dayKey);
  const slot = day?.slots.find((s) => s.startISO === startAt.toISOString());
  if (!slot || slot.employeeIds.length === 0) {
    throw new BookingConflictError('That time is no longer available. Please choose another slot.');
  }

  // Honour an explicit team-member choice; otherwise assign a free one.
  let employeeId: string | null;
  if (input.employeeId) {
    if (!slot.employeeIds.includes(input.employeeId)) {
      throw new BookingConflictError('That team member is no longer available at this time.');
    }
    employeeId = input.employeeId;
  } else {
    employeeId = slot.employeeIds[0] ?? null;
  }

  const repos = repositoriesFor(businessId, db);
  const customer = await repos.customers.upsertByEmail({
    email,
    firstName,
    lastName,
    phone: input.customer.phone?.trim() || null,
  });

  const booking = await repos.bookings.create({
    customerId: customer.id,
    serviceId: service.id,
    employeeId,
    startAt,
    endAt,
    timezone: timeZone,
    priceTotal: service.price,
    currency: business.currency,
    status: 'PENDING',
    source: 'public',
    notes: input.notes?.trim() || null,
  });

  const employee = employeeId
    ? await db.employee.findFirst({ where: { id: employeeId, businessId }, select: { firstName: true, lastName: true } })
    : null;

  await writeAudit({
    businessId,
    actorUserId: null,
    action: 'booking.public_create',
    entity: 'Booking',
    entityId: booking.id,
    metadata: { source: 'public' },
  }, db);

  return {
    id: booking.id,
    reference: referenceFor(booking.id),
    status: 'PENDING',
    startISO: startAt.toISOString(),
    endISO: endAt.toISOString(),
    serviceName: service.name,
    employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : null,
    businessName: business.name,
    timezone: timeZone,
    currency: business.currency,
    price: Number(service.price),
  };
}
