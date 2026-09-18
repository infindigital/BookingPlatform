import type { BookingStatus, PrismaClient } from '@prisma/client';
import { ValidationError, BookingConflictError, canTransition, isReschedulable } from '@booking/core';
import { prisma } from '../client';
import { wallTimeToInstant } from '../dashboard/timezone';
import { getAvailability } from '../availability/availability';
import { transitionBooking } from '../booking/transition';
import { rescheduleBooking } from '../booking/reschedule';
import { writeAudit } from '../audit';
import { handleBookingEvent } from '../notifications/enqueue';
import { referenceFor } from './reference';

/**
 * Customer self-service (public) - look up and manage your OWN bookings.
 *
 * Ownership is proven by (email + booking reference): a valid pair means the
 * person holds a real confirmation, which is not enumerable. EVERY operation
 * re-verifies that pair server-side and confirms the target booking belongs to
 * the resolved customer - the client is never trusted.
 */

export interface ManageBookingRow {
  id: string;
  reference: string;
  serviceId: string;
  serviceName: string;
  serviceColor: string | null;
  employeeId: string | null;
  employeeName: string | null;
  startISO: string;
  endISO: string;
  status: BookingStatus;
  durationMinutes: number;
  priceTotal: number;
  currency: string;
  isUpcoming: boolean;
  canCancel: boolean;
  canReschedule: boolean;
}

export interface ManageLookupResult {
  customerName: string;
  timeZone: string;
  bookings: ManageBookingRow[];
}

interface Ownership {
  businessId: string;
  customerId: string;
  customerName: string;
  timeZone: string;
}

function normaliseReference(reference: string): string {
  return reference.trim().toUpperCase().replace(/\s+/g, '');
}

/** Resolve the business + customer proven by (email, reference), or null. */
async function verifyOwnership(
  slug: string,
  email: string,
  reference: string,
  db: PrismaClient,
): Promise<Ownership | null> {
  const ref = normaliseReference(reference);
  const cleanEmail = email.trim().toLowerCase();
  if (!slug || !cleanEmail || !ref) return null;

  const business = await db.business.findUnique({ where: { slug }, select: { id: true, timezone: true } });
  if (!business) return null;

  const customer = await db.customer.findFirst({
    where: { businessId: business.id, email: cleanEmail },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!customer) return null;

  // The reference must match one of THIS customer's bookings.
  const bookings = await db.booking.findMany({
    where: { businessId: business.id, customerId: customer.id },
    select: { id: true },
  });
  const owns = bookings.some((b) => referenceFor(b.id) === ref);
  if (!owns) return null;

  return {
    businessId: business.id,
    customerId: customer.id,
    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
    timeZone: business.timezone || 'UTC',
  };
}

const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'RESCHEDULED'];

export async function lookupCustomerBookings(
  slug: string,
  email: string,
  reference: string,
  db: PrismaClient = prisma,
): Promise<ManageLookupResult | null> {
  const owner = await verifyOwnership(slug, email, reference, db);
  if (!owner) return null;

  const rows = await db.booking.findMany({
    where: { businessId: owner.businessId, customerId: owner.customerId },
    orderBy: { startAt: 'desc' },
    select: {
      id: true,
      serviceId: true,
      employeeId: true,
      startAt: true,
      endAt: true,
      status: true,
      priceTotal: true,
      currency: true,
      service: { select: { name: true, color: true } },
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  const now = Date.now();
  const bookings: ManageBookingRow[] = rows.map((b) => {
    const isUpcoming = ACTIVE_STATUSES.includes(b.status) && b.startAt.getTime() >= now;
    return {
      id: b.id,
      reference: referenceFor(b.id),
      serviceId: b.serviceId,
      serviceName: b.service.name,
      serviceColor: b.service.color,
      employeeId: b.employeeId,
      employeeName: b.employee ? `${b.employee.firstName} ${b.employee.lastName}`.trim() : null,
      startISO: b.startAt.toISOString(),
      endISO: b.endAt.toISOString(),
      status: b.status,
      durationMinutes: Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000),
      priceTotal: Number(b.priceTotal),
      currency: b.currency,
      isUpcoming,
      canCancel: isUpcoming && canTransition(b.status, 'CANCELLED'),
      canReschedule: isUpcoming && isReschedulable(b.status),
    };
  });

  return { customerName: owner.customerName, timeZone: owner.timeZone, bookings };
}

/** Load the target booking, asserting it belongs to the verified customer. */
async function ownedBooking(owner: Ownership, bookingId: string, db: PrismaClient) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, businessId: owner.businessId, customerId: owner.customerId },
    select: { id: true, status: true, serviceId: true, employeeId: true, startAt: true, endAt: true },
  });
  return booking;
}

export async function cancelOwnBooking(
  slug: string,
  email: string,
  reference: string,
  bookingId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const owner = await verifyOwnership(slug, email, reference, db);
  if (!owner) throw new ValidationError('We could not verify that booking.');
  const booking = await ownedBooking(owner, bookingId, db);
  if (!booking) throw new ValidationError('That booking could not be found.');

  await transitionBooking(owner.businessId, bookingId, 'CANCELLED', db);
  await writeAudit(
    { businessId: owner.businessId, actorUserId: null, action: 'booking.public_cancel', entity: 'Booking', entityId: bookingId },
    db,
  );
  await handleBookingEvent(owner.businessId, bookingId, 'BOOKING_CANCELLED', db);
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export async function rescheduleOwnBooking(
  slug: string,
  email: string,
  reference: string,
  bookingId: string,
  dayKey: string,
  time: string,
  db: PrismaClient = prisma,
): Promise<{ startISO: string }> {
  const owner = await verifyOwnership(slug, email, reference, db);
  if (!owner) throw new ValidationError('We could not verify that booking.');
  const booking = await ownedBooking(owner, bookingId, db);
  if (!booking) throw new ValidationError('That booking could not be found.');
  if (!isReschedulable(booking.status)) throw new ValidationError('This booking can no longer be rescheduled.');

  const minutes = parseHHMM(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || minutes === null) throw new ValidationError('Please choose a valid date and time.');

  const durationMs = booking.endAt.getTime() - booking.startAt.getTime();
  const startAt = wallTimeToInstant(dayKey, minutes, owner.timeZone);
  const endAt = new Date(startAt.getTime() + durationMs);

  // Re-validate the requested slot against live availability (working hours,
  // breaks, other bookings, buffers) for the same service + employee.
  const availability = await getAvailability(
    owner.businessId,
    {
      serviceId: booking.serviceId,
      employeeId: booking.employeeId,
      fromDayKey: dayKey,
      toDayKey: dayKey,
      timeZone: owner.timeZone,
      now: new Date(),
    },
    db,
  );
  const day = availability.days.find((d) => d.dayKey === dayKey);
  const slot = day?.slots.find((s) => s.startISO === startAt.toISOString());
  if (!slot) throw new BookingConflictError('That time is not available. Please choose another slot.');

  // rescheduleBooking keeps the employee and re-checks overlap excluding self.
  await rescheduleBooking(owner.businessId, bookingId, { startAt, endAt }, db);
  await writeAudit(
    { businessId: owner.businessId, actorUserId: null, action: 'booking.public_reschedule', entity: 'Booking', entityId: bookingId, metadata: { to: startAt.toISOString() } },
    db,
  );
  await handleBookingEvent(owner.businessId, bookingId, 'BOOKING_RESCHEDULED', db);
  return { startISO: startAt.toISOString() };
}
