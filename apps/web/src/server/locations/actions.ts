'use server';

import { revalidatePath } from 'next/cache';
import { repositoriesFor, writeAudit, type LocationMode } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface LocationActionState {
  ok: boolean;
  error?: string;
  locationId?: string;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

const MODES: LocationMode[] = ['IN_PERSON', 'MOBILE', 'VIRTUAL'];

function refresh(): void {
  revalidatePath('/admin/locations');
  revalidatePath('/admin');
}

interface LocationValues {
  name: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  mapUrl: string | null;
  phone: string | null;
  email: string | null;
  instructions: string | null;
  mode: LocationMode;
  timezone: string | null;
  isDefault: boolean;
  isActive: boolean;
}

/** Trimmed string from the form, capped and nulled when empty. */
function str(formData: FormData, key: string, max: number): string | null {
  return String(formData.get(key) ?? '').trim().slice(0, max) || null;
}

/** Unique, non-empty checkbox values submitted under a repeated field name. */
function ids(formData: FormData, key: string): string[] {
  const seen = new Set<string>();
  for (const raw of formData.getAll(key)) {
    const id = String(raw).trim();
    if (id) seen.add(id);
  }
  return [...seen];
}

function parseLocationForm(formData: FormData): { values?: LocationValues; error?: string } {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'A location name is required.' };

  const modeRaw = String(formData.get('mode') ?? '').trim() as LocationMode;
  const mode: LocationMode = MODES.includes(modeRaw) ? modeRaw : 'IN_PERSON';

  return {
    values: {
      name: name.slice(0, 120),
      address: str(formData, 'address', 300),
      addressLine2: str(formData, 'addressLine2', 300),
      city: str(formData, 'city', 120),
      state: str(formData, 'state', 120),
      postalCode: str(formData, 'postalCode', 32),
      country: str(formData, 'country', 120),
      mapUrl: str(formData, 'mapUrl', 500),
      phone: str(formData, 'phone', 40),
      email: str(formData, 'email', 160),
      instructions: str(formData, 'instructions', 1000),
      mode,
      timezone: str(formData, 'timezone', 64),
      isDefault: String(formData.get('isDefault') ?? '') === 'on',
      isActive: String(formData.get('isActive') ?? '') === 'on',
    },
  };
}

export async function createLocationAction(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const session = await requirePermission('settings.manage');
  const parsed = parseLocationForm(formData);
  if (!parsed.values) return { ok: false, error: parsed.error };

  try {
    const repos = repositoriesFor(session.user.businessId);
    const location = await repos.locations.create({ ...parsed.values, isActive: true });
    if (parsed.values.isDefault) await repos.locations.clearDefault(location.id);
    await repos.locations.setServices(location.id, ids(formData, 'serviceIds'));
    await repos.locations.setEmployees(location.id, ids(formData, 'employeeIds'));
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'location.create',
      entity: 'Location',
      entityId: location.id,
    });
    refresh();
    return { ok: true, locationId: location.id };
  } catch (error) {
    logger.error('location.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the location. Please try again.' };
  }
}

export async function updateLocationAction(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const session = await requirePermission('settings.manage');
  const id = String(formData.get('locationId') ?? '');
  if (!id) return { ok: false, error: 'Missing location.' };

  const parsed = parseLocationForm(formData);
  if (!parsed.values) return { ok: false, error: parsed.error };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.locations.getById(id);
  if (!existing) return { ok: false, error: 'That location could not be found.' };

  try {
    await repos.locations.update(id, { ...parsed.values });
    if (parsed.values.isDefault) await repos.locations.clearDefault(id);
    await repos.locations.setServices(id, ids(formData, 'serviceIds'));
    await repos.locations.setEmployees(id, ids(formData, 'employeeIds'));
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'location.update',
      entity: 'Location',
      entityId: id,
    });
    refresh();
    return { ok: true, locationId: id };
  } catch (error) {
    logger.error('location.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the location. Please try again.' };
  }
}

// ---- Location notices -------------------------------------------------------

const NOTICE_LEVELS = ['info', 'warning', 'critical'] as const;
type NoticeLevel = (typeof NOTICE_LEVELS)[number];

export interface NoticeActionState {
  ok: boolean;
  error?: string;
  noticeId?: string;
}

interface NoticeValues {
  locationId: string | null;
  title: string | null;
  message: string;
  level: NoticeLevel;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
}

/** Parse a datetime-local ("YYYY-MM-DDTHH:mm") value into a Date, or null. */
function dateOrNull(formData: FormData, key: string): Date | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNoticeForm(formData: FormData): { values?: NoticeValues; error?: string } {
  const message = String(formData.get('message') ?? '').trim();
  if (!message) return { error: 'A notice message is required.' };

  const locationRaw = String(formData.get('locationId') ?? '').trim();
  const levelRaw = String(formData.get('level') ?? '').trim() as NoticeLevel;
  const level: NoticeLevel = NOTICE_LEVELS.includes(levelRaw) ? levelRaw : 'info';

  const startsAt = dateOrNull(formData, 'startsAt');
  const endsAt = dateOrNull(formData, 'endsAt');
  if (startsAt && endsAt && endsAt.getTime() < startsAt.getTime()) {
    return { error: 'The end time must be after the start time.' };
  }

  return {
    values: {
      locationId: locationRaw || null,
      title: String(formData.get('title') ?? '').trim().slice(0, 160) || null,
      message: message.slice(0, 1000),
      level,
      startsAt,
      endsAt,
      isActive: String(formData.get('isActive') ?? '') === 'on',
    },
  };
}

export async function createNoticeAction(
  _prev: NoticeActionState,
  formData: FormData,
): Promise<NoticeActionState> {
  const session = await requirePermission('settings.manage');
  const parsed = parseNoticeForm(formData);
  if (!parsed.values) return { ok: false, error: parsed.error };

  try {
    const repos = repositoriesFor(session.user.businessId);
    const notice = await repos.locations.createNotice(parsed.values);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'location.notice.create',
      entity: 'LocationNotice',
      entityId: notice.id,
    });
    refresh();
    return { ok: true, noticeId: notice.id };
  } catch (error) {
    logger.error('location.notice.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the notice. Please try again.' };
  }
}

export async function updateNoticeAction(
  _prev: NoticeActionState,
  formData: FormData,
): Promise<NoticeActionState> {
  const session = await requirePermission('settings.manage');
  const id = String(formData.get('noticeId') ?? '');
  if (!id) return { ok: false, error: 'Missing notice.' };

  const parsed = parseNoticeForm(formData);
  if (!parsed.values) return { ok: false, error: parsed.error };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.locations.getNotice(id);
  if (!existing) return { ok: false, error: 'That notice could not be found.' };

  try {
    await repos.locations.updateNotice(id, parsed.values);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'location.notice.update',
      entity: 'LocationNotice',
      entityId: id,
    });
    refresh();
    return { ok: true, noticeId: id };
  } catch (error) {
    logger.error('location.notice.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the notice. Please try again.' };
  }
}

export async function deleteNoticeAction(input: { noticeId: string }): Promise<MutationResult> {
  const session = await requirePermission('settings.manage');
  if (!input.noticeId) return { ok: false, error: 'Missing notice.' };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.locations.getNotice(input.noticeId);
  if (!existing) return { ok: false, error: 'That notice could not be found.' };

  try {
    await repos.locations.deleteNotice(input.noticeId);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'location.notice.delete',
      entity: 'LocationNotice',
      entityId: input.noticeId,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('location.notice.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the notice. Please try again.' };
  }
}

export async function deleteLocationAction(input: { locationId: string }): Promise<MutationResult> {
  const session = await requirePermission('settings.manage');
  if (!input.locationId) return { ok: false, error: 'Missing location.' };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.locations.getById(input.locationId);
  if (!existing) return { ok: false, error: 'That location could not be found.' };

  try {
    await repos.locations.delete(input.locationId);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'location.delete',
      entity: 'Location',
      entityId: input.locationId,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('location.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the location. Please try again.' };
  }
}
