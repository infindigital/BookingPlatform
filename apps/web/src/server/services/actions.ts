'use server';

import { revalidatePath } from 'next/cache';
import { repositoriesFor, writeAudit, resetBusinessData, type ResetSummary } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface ServiceActionState {
  ok: boolean;
  error?: string;
  serviceId?: string;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function refresh(): void {
  revalidatePath('/admin/services');
  revalidatePath('/admin/employees');
  revalidatePath('/admin');
}

/** Parse a required positive integer from form data. */
function posInt(value: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function parseServiceForm(formData: FormData): {
  values?: {
    name: string;
    description: string | null;
    categoryId: string | null;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    price: number;
    color: string | null;
    isActive: boolean;
  };
  error?: string;
} {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'A service name is required.' };

  const durationMinutes = posInt(formData.get('durationMinutes'), 0);
  if (durationMinutes < 5) return { error: 'Duration must be at least 5 minutes.' };

  const priceRaw = String(formData.get('price') ?? '').trim();
  const price = priceRaw === '' ? 0 : Number(priceRaw);
  if (!Number.isFinite(price) || price < 0) return { error: 'Price must be zero or more.' };

  const color = String(formData.get('color') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();

  return {
    values: {
      name: name.slice(0, 120),
      description: String(formData.get('description') ?? '').trim().slice(0, 500) || null,
      categoryId: categoryId || null,
      durationMinutes,
      bufferBeforeMinutes: posInt(formData.get('bufferBeforeMinutes'), 0),
      bufferAfterMinutes: posInt(formData.get('bufferAfterMinutes'), 0),
      price,
      color: HEX_RE.test(color) ? color.toLowerCase() : null,
      isActive: String(formData.get('isActive') ?? '') === 'on',
    },
  };
}

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const session = await requirePermission('service.manage');
  const parsed = parseServiceForm(formData);
  if (!parsed.values) return { ok: false, error: parsed.error };

  try {
    const repos = repositoriesFor(session.user.businessId);
    const service = await repos.services.create({
      name: parsed.values.name,
      description: parsed.values.description,
      categoryId: parsed.values.categoryId,
      durationMinutes: parsed.values.durationMinutes,
      bufferBeforeMinutes: parsed.values.bufferBeforeMinutes,
      bufferAfterMinutes: parsed.values.bufferAfterMinutes,
      price: parsed.values.price,
      color: parsed.values.color,
      isActive: true,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'service.create',
      entity: 'Service',
      entityId: service.id,
    });
    refresh();
    return { ok: true, serviceId: service.id };
  } catch (error) {
    logger.error('service.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the service. Please try again.' };
  }
}

export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const session = await requirePermission('service.manage');
  const id = String(formData.get('serviceId') ?? '');
  if (!id) return { ok: false, error: 'Missing service.' };

  const parsed = parseServiceForm(formData);
  if (!parsed.values) return { ok: false, error: parsed.error };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.services.getById(id);
  if (!existing) return { ok: false, error: 'That service could not be found.' };

  try {
    await repos.services.update(id, {
      name: parsed.values.name,
      description: parsed.values.description,
      category: parsed.values.categoryId
        ? { connect: { id: parsed.values.categoryId } }
        : { disconnect: true },
      durationMinutes: parsed.values.durationMinutes,
      bufferBeforeMinutes: parsed.values.bufferBeforeMinutes,
      bufferAfterMinutes: parsed.values.bufferAfterMinutes,
      price: parsed.values.price,
      color: parsed.values.color,
      isActive: parsed.values.isActive,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'service.update',
      entity: 'Service',
      entityId: id,
    });
    refresh();
    return { ok: true, serviceId: id };
  } catch (error) {
    logger.error('service.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the service. Please try again.' };
  }
}

export async function deleteServiceAction(input: { serviceId: string }): Promise<MutationResult> {
  const session = await requirePermission('service.manage');
  if (!input.serviceId) return { ok: false, error: 'Missing service.' };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.services.getById(input.serviceId);
  if (!existing) return { ok: false, error: 'That service could not be found.' };

  // Bookings reference services with onDelete: Restrict - block and suggest deactivating.
  const bookings = await repos.services.bookingCount(input.serviceId);
  if (bookings > 0) {
    return {
      ok: false,
      error: `This service has ${bookings} booking${bookings === 1 ? '' : 's'} and can't be deleted. Deactivate it instead to hide it from new bookings.`,
    };
  }

  try {
    await repos.services.delete(input.serviceId);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'service.delete',
      entity: 'Service',
      entityId: input.serviceId,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('service.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the service. Please try again.' };
  }
}

export async function createCategoryAction(input: { name: string }): Promise<MutationResult> {
  const session = await requirePermission('service.manage');
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'A category name is required.' };

  try {
    const repos = repositoriesFor(session.user.businessId);
    await repos.services.createCategory({ name: name.slice(0, 80) });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('category.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the category. Please try again.' };
  }
}

export async function deleteCategoryAction(input: { categoryId: string }): Promise<MutationResult> {
  const session = await requirePermission('service.manage');
  if (!input.categoryId) return { ok: false, error: 'Missing category.' };

  try {
    const repos = repositoriesFor(session.user.businessId);
    await repos.services.deleteCategory(input.categoryId);
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('category.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the category. Please try again.' };
  }
}

export interface ResetResult extends MutationResult {
  summary?: ResetSummary;
}

/**
 * Wipe all operational data (services, employees, customers, bookings,
 * notifications) so the owner can start from scratch. Keeps the login, locations
 * and form design. Requires an explicit typed confirmation.
 */
export async function resetBusinessDataAction(input: { confirm: string }): Promise<ResetResult> {
  const session = await requirePermission('settings.manage');
  if (input.confirm !== 'RESET') {
    return { ok: false, error: 'Type RESET to confirm.' };
  }

  try {
    const summary = await resetBusinessData(session.user.businessId, session.user.id);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'business.reset',
      entity: 'Business',
      entityId: session.user.businessId,
      metadata: { ...summary },
    });
    revalidatePath('/admin/services');
    revalidatePath('/admin/employees');
    revalidatePath('/admin/customers');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin');
    return { ok: true, summary };
  } catch (error) {
    logger.error('business.reset.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not reset the workspace. Please try again.' };
  }
}
