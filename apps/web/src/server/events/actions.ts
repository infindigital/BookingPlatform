'use server';

import { revalidatePath } from 'next/cache';
import {
  repositoriesFor,
  getEventsList,
  getEventDetail,
  wallTimeToInstant,
  businessRepository,
  writeAudit,
  type EventListRow,
  type EventDetail,
} from '@booking/db';
import { DomainError, resolveEventInput, parseHHMM, type EventStatus, type EventRegistrationStatus } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface EventActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export interface CustomerOption {
  id: string;
  name: string;
  email: string;
}

function refresh(): void {
  revalidatePath('/admin/events');
}

function fail(event: string, error: unknown, fallback: string): EventActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  logger.error(event, { message: (error as Error)?.message });
  return { ok: false, error: fallback };
}

async function timezoneFor(businessId: string): Promise<string> {
  const b = await businessRepository.getById(businessId);
  return b?.timezone || 'UTC';
}

export async function loadEvents(): Promise<EventListRow[]> {
  const session = await requirePermission('event.manage');
  return getEventsList(session.user.businessId, { includeCancelled: true });
}

export async function loadEventDetail(id: string): Promise<EventDetail | null> {
  const session = await requirePermission('event.manage');
  return getEventDetail(session.user.businessId, id);
}

export async function searchCustomers(query: string): Promise<CustomerOption[]> {
  const session = await requirePermission('event.manage');
  const rows = await repositoriesFor(session.user.businessId).customers.list({ search: query, take: 10 });
  return rows.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email }));
}

export interface EventFormInput {
  title: string;
  description: string | null;
  dayKey: string;
  startTime: string;
  endTime: string;
  capacity: number;
  price: number;
  currency: string;
  locationId: string | null;
  employeeId: string | null;
  status: EventStatus;
}

function toResolved(input: EventFormInput, timeZone: string) {
  const sMin = parseHHMM(input.startTime);
  const eMin = parseHHMM(input.endTime);
  if (sMin === null || eMin === null) throw new DomainError('VALIDATION', 'Enter valid start and end times.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)) throw new DomainError('VALIDATION', 'Pick a date.');
  const startAt = wallTimeToInstant(input.dayKey, sMin, timeZone);
  const endAt = wallTimeToInstant(input.dayKey, eMin, timeZone);
  return resolveEventInput({
    title: input.title,
    description: input.description,
    startAt,
    endAt,
    capacity: input.capacity,
    price: input.price,
    currency: input.currency,
    locationId: input.locationId,
    employeeId: input.employeeId,
    status: input.status,
  });
}

export async function createEvent(input: EventFormInput): Promise<EventActionResult> {
  const session = await requirePermission('event.manage');
  try {
    const resolved = toResolved(input, await timezoneFor(session.user.businessId));
    const created = await repositoriesFor(session.user.businessId).events.create(resolved);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'event.create',
      entity: 'Event',
      entityId: created.id,
      metadata: { title: resolved.title, capacity: resolved.capacity },
    });
    refresh();
    return { ok: true, id: created.id };
  } catch (error) {
    return fail('event.create.failed', error, 'Could not create the event.');
  }
}

export async function updateEvent(id: string, input: EventFormInput): Promise<EventActionResult> {
  const session = await requirePermission('event.manage');
  try {
    const resolved = toResolved(input, await timezoneFor(session.user.businessId));
    const res = await repositoriesFor(session.user.businessId).events.update(id, resolved);
    if (res.count === 0) return { ok: false, error: 'Event not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'event.update', entity: 'Event', entityId: id });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail('event.update.failed', error, 'Could not update the event.');
  }
}

export async function setEventStatus(id: string, status: EventStatus): Promise<EventActionResult> {
  const session = await requirePermission('event.manage');
  try {
    await repositoriesFor(session.user.businessId).events.setStatus(id, status);
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'event.status', entity: 'Event', entityId: id, metadata: { status } });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('event.status.failed', error, 'Could not update the event.');
  }
}

export async function deleteEvent(id: string): Promise<EventActionResult> {
  const session = await requirePermission('event.manage');
  try {
    const res = await repositoriesFor(session.user.businessId).events.delete(id);
    if (!res.ok) return { ok: false, error: 'Event not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'event.delete', entity: 'Event', entityId: id });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('event.delete.failed', error, 'Could not delete the event.');
  }
}

export interface RegisterAttendeeInput {
  eventId: string;
  customerId: string;
  seats: number;
  note: string | null;
}

export async function registerAttendee(input: RegisterAttendeeInput): Promise<EventActionResult> {
  const session = await requirePermission('event.manage');
  try {
    const reg = await repositoriesFor(session.user.businessId).events.register({
      eventId: input.eventId,
      customerId: input.customerId,
      seats: input.seats,
      note: input.note,
    });
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'event.register', entity: 'EventRegistration', entityId: reg.id, metadata: { eventId: input.eventId, seats: input.seats } });
    refresh();
    return { ok: true, id: reg.id };
  } catch (error) {
    return fail('event.register.failed', error, 'Could not register the attendee.');
  }
}

export async function setRegistrationStatus(id: string, status: EventRegistrationStatus): Promise<EventActionResult> {
  const session = await requirePermission('event.manage');
  try {
    const res = await repositoriesFor(session.user.businessId).events.setRegistrationStatus(id, status);
    if (res.count === 0) return { ok: false, error: 'Registration not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'event.registration.status', entity: 'EventRegistration', entityId: id, metadata: { status } });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('event.registration.status.failed', error, 'Could not update the registration.');
  }
}
