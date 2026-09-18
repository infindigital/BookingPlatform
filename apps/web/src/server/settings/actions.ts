'use server';

import { revalidatePath } from 'next/cache';
import { repositoriesFor, writeAudit, type HolidayRow } from '@booking/db';
import { DomainError, type DayHours } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

export interface LocationView {
  id: string;
  name: string;
  address: string | null;
  timezone: string | null;
  isActive: boolean;
}

function refresh(): void {
  revalidatePath('/admin/settings');
}

function fail(event: string, error: unknown, fallback: string): SettingsActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  logger.error(event, { message: (error as Error)?.message });
  return { ok: false, error: fallback };
}

// --- Business profile -------------------------------------------------------

export interface BusinessProfileFormInput {
  name: string;
  timezone: string;
  currency: string;
  email: string | null;
  phone: string | null;
}

export async function saveBusinessProfileAction(input: BusinessProfileFormInput): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const profile = await repos.settings.updateBusinessProfile(input);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.profile.update',
      entity: 'Business',
      entityId: session.user.businessId,
      metadata: { timezone: profile.timezone, currency: profile.currency },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.profile.update.failed', error, 'Could not save the business profile.');
  }
}

// --- Locations --------------------------------------------------------------

function toView(l: { id: string; name: string; address: string | null; timezone: string | null; isActive: boolean }): LocationView {
  return { id: l.id, name: l.name, address: l.address, timezone: l.timezone, isActive: l.isActive };
}

export async function listLocationsAction(): Promise<LocationView[]> {
  const session = await requirePermission('settings.manage');
  const rows = await repositoriesFor(session.user.businessId).settings.listLocations();
  return rows.map(toView);
}

export interface LocationFormInput {
  name: string;
  address: string | null;
  timezone: string | null;
  isActive: boolean;
}

export async function createLocationAction(input: LocationFormInput): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const created = await repositoriesFor(session.user.businessId).settings.createLocation(input);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.location.create',
      entity: 'Location',
      entityId: created.id,
      metadata: { name: created.name },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.location.create.failed', error, 'Could not create the location.');
  }
}

export async function updateLocationAction(id: string, input: LocationFormInput): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const res = await repositoriesFor(session.user.businessId).settings.updateLocation(id, input);
    if (res.count === 0) return { ok: false, error: 'Location not found.' };
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.location.update',
      entity: 'Location',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.location.update.failed', error, 'Could not update the location.');
  }
}

export async function toggleLocationActiveAction(id: string, isActive: boolean): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    await repositoriesFor(session.user.businessId).settings.setLocationActive(id, isActive);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.location.toggle.failed', error, 'Could not update the location.');
  }
}

export async function deleteLocationAction(id: string): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const res = await repositoriesFor(session.user.businessId).settings.deleteLocation(id);
    if (!res.ok) return { ok: false, error: 'Location not found.' };
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.location.delete',
      entity: 'Location',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.location.delete.failed', error, 'Could not delete the location.');
  }
}

// --- Business hours ---------------------------------------------------------

export async function saveBusinessHoursAction(week: DayHours[]): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    await repositoriesFor(session.user.businessId).settings.replaceBusinessHours(week);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.hours.update',
      entity: 'BusinessHours',
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.hours.update.failed', error, 'Could not save the opening hours.');
  }
}

// --- Holidays ---------------------------------------------------------------

export async function listHolidaysAction(): Promise<HolidayRow[]> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).settings.listHolidays();
}

export interface HolidayFormInput {
  name: string;
  dayKey: string;
  recurringYearly: boolean;
}

export async function createHolidayAction(input: HolidayFormInput): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const created = await repositoriesFor(session.user.businessId).settings.createHoliday(input);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.holiday.create',
      entity: 'Holiday',
      entityId: created.id,
      metadata: { name: created.name },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.holiday.create.failed', error, 'Could not add the closure.');
  }
}

export async function updateHolidayAction(id: string, input: HolidayFormInput): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const res = await repositoriesFor(session.user.businessId).settings.updateHoliday(id, input);
    if (res.count === 0) return { ok: false, error: 'Closure not found.' };
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.holiday.update',
      entity: 'Holiday',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.holiday.update.failed', error, 'Could not update the closure.');
  }
}

export async function deleteHolidayAction(id: string): Promise<SettingsActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    await repositoriesFor(session.user.businessId).settings.deleteHoliday(id);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'settings.holiday.delete',
      entity: 'Holiday',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return fail('settings.holiday.delete.failed', error, 'Could not delete the closure.');
  }
}
