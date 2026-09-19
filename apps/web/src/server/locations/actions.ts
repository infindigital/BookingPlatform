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

function parseLocationForm(formData: FormData): {
  values?: {
    name: string;
    address: string | null;
    phone: string | null;
    instructions: string | null;
    mode: LocationMode;
    isActive: boolean;
  };
  error?: string;
} {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'A location name is required.' };

  const modeRaw = String(formData.get('mode') ?? '').trim() as LocationMode;
  const mode: LocationMode = MODES.includes(modeRaw) ? modeRaw : 'IN_PERSON';

  return {
    values: {
      name: name.slice(0, 120),
      address: String(formData.get('address') ?? '').trim().slice(0, 300) || null,
      phone: String(formData.get('phone') ?? '').trim().slice(0, 40) || null,
      instructions: String(formData.get('instructions') ?? '').trim().slice(0, 1000) || null,
      mode,
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
    const location = await repos.locations.create({
      name: parsed.values.name,
      address: parsed.values.address,
      phone: parsed.values.phone,
      instructions: parsed.values.instructions,
      mode: parsed.values.mode,
      isActive: true,
    });
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
    await repos.locations.update(id, {
      name: parsed.values.name,
      address: parsed.values.address,
      phone: parsed.values.phone,
      instructions: parsed.values.instructions,
      mode: parsed.values.mode,
      isActive: parsed.values.isActive,
    });
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
