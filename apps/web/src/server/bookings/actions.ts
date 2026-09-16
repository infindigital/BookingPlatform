'use server';

import { revalidatePath } from 'next/cache';
import {
  transitionBooking,
  rescheduleBooking,
  writeAudit,
  prisma,
  repositoriesFor,
  wallTimeToInstant,
} from '@booking/db';
import { DomainError, actionByKey } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface BookingActionState {
  ok: boolean;
  error?: string;
}

function refresh(): void {
  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/calendar');
}

function parseMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Generic status action (approve / reject / complete / no_show / cancel) for the
 * bookings screen. The action key resolves to a target status and the permission
 * it requires (via the core state machine). Benign domain errors (already-decided,
 * gone) just refresh the view.
 */
export async function bookingAction(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const def = actionByKey(String(formData.get('action') ?? ''));
  if (!def) return;

  const session = await requirePermission(def.permission);
  try {
    const result = await transitionBooking(session.user.businessId, bookingId, def.target);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: `booking.${def.key}`,
      entity: 'Booking',
      entityId: result.id,
      metadata: { from: result.from, to: result.to },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      logger.info('booking.action.skipped', { bookingId, action: def.key, code: error.code });
    } else {
      throw error;
    }
  }
  refresh();
}

/** Dashboard pending-queue shortcuts (kept for the Overview page). */
export async function approveBooking(formData: FormData): Promise<void> {
  formData.set('action', 'approve');
  await bookingAction(formData);
}
export async function rejectBooking(formData: FormData): Promise<void> {
  formData.set('action', 'reject');
  await bookingAction(formData);
}

/** Reschedule (time + optional employee), with double-booking re-validation. */
export async function rescheduleBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const session = await requirePermission('booking.write');
  const bookingId = String(formData.get('bookingId') ?? '');
  const date = String(formData.get('date') ?? '');
  const minutes = parseMinutes(String(formData.get('time') ?? ''));
  const duration = Number(formData.get('durationMinutes') ?? '0');
  const employeeChoice = String(formData.get('employeeId') ?? 'keep');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minutes === null || !duration) {
    return { ok: false, error: 'Please provide a valid date and time.' };
  }

  const business = await prisma.business.findUnique({
    where: { id: session.user.businessId },
    select: { timezone: true },
  });
  const timeZone = business?.timezone || 'UTC';
  const startAt = wallTimeToInstant(date, minutes, timeZone);
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const employeeId = employeeChoice === 'keep' ? undefined : employeeChoice === 'none' ? null : employeeChoice;

  try {
    const result = await rescheduleBooking(session.user.businessId, bookingId, { startAt, endAt, employeeId });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'booking.reschedule',
      entity: 'Booking',
      entityId: result.id,
      metadata: { to: startAt.toISOString() },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Create a booking manually (admin). Confirmed on creation; conflicts are rejected. */
export async function createBookingAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const session = await requirePermission('booking.write');
  const businessId = session.user.businessId;

  const serviceId = String(formData.get('serviceId') ?? '');
  const date = String(formData.get('date') ?? '');
  const minutes = parseMinutes(String(formData.get('time') ?? ''));
  const employeeChoice = String(formData.get('employeeId') ?? 'none');
  const locationId = String(formData.get('locationId') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();
  const customerMode = String(formData.get('customerMode') ?? 'existing');

  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || minutes === null) {
    return { ok: false, error: 'Select a service and a valid date and time.' };
  }

  const [service, business] = await Promise.all([
    prisma.service.findFirst({
      where: { id: serviceId, businessId },
      select: { durationMinutes: true, price: true },
    }),
    prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true, currency: true } }),
  ]);
  if (!service) return { ok: false, error: 'That service could not be found.' };

  const repos = repositoriesFor(businessId);

  // Resolve the customer (existing, or quick-create by email).
  let customerId: string;
  if (customerMode === 'new') {
    const email = String(formData.get('customerEmail') ?? '').trim().toLowerCase();
    const firstName = String(formData.get('customerFirstName') ?? '').trim();
    const lastName = String(formData.get('customerLastName') ?? '').trim();
    if (!email || !firstName) return { ok: false, error: 'A new customer needs a first name and email.' };
    const customer = await repos.customers.upsertByEmail({
      email,
      firstName,
      lastName,
      phone: String(formData.get('customerPhone') ?? '').trim() || null,
    });
    customerId = customer.id;
  } else {
    const existingId = String(formData.get('customerId') ?? '');
    const customer = existingId ? await repos.customers.getById(existingId) : null;
    if (!customer) return { ok: false, error: 'Please choose a customer.' };
    customerId = customer.id;
  }

  const timeZone = business?.timezone || 'UTC';
  const startAt = wallTimeToInstant(date, minutes, timeZone);
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  const employeeId = employeeChoice && employeeChoice !== 'none' ? employeeChoice : null;

  try {
    const booking = await repos.bookings.create({
      customerId,
      serviceId,
      employeeId,
      locationId: locationId || null,
      startAt,
      endAt,
      priceTotal: service.price,
      currency: business?.currency ?? 'USD',
      status: 'ACCEPTED',
      source: 'admin',
      notes: notes || null,
    });
    await writeAudit({
      businessId,
      actorUserId: session.user.id,
      action: 'booking.create',
      entity: 'Booking',
      entityId: booking.id,
      metadata: { source: 'admin' },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}
