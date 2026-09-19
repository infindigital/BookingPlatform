'use server';

import { revalidatePath } from 'next/cache';
import { repositoriesFor, writeAudit, optionsToArray } from '@booking/db';
import { CUSTOM_FIELD_TYPES, type CustomFieldType } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

/**
 * Per-service custom-field (booking question) management. Gated by
 * service.manage. Options for SELECT / RADIO travel as a string array.
 */

export interface ServiceFieldRow {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
  placeholder: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ServiceFieldInput {
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
  placeholder: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface FieldMutationResult {
  ok: boolean;
  error?: string;
}

function refresh(): void {
  revalidatePath('/admin/services');
}

function sanitise(input: ServiceFieldInput): { values?: ServiceFieldInput; error?: string } {
  const label = input.label?.trim();
  if (!label) return { error: 'A question label is required.' };
  const type: CustomFieldType = CUSTOM_FIELD_TYPES.includes(input.type) ? input.type : 'TEXT';
  const needsOptions = type === 'SELECT' || type === 'RADIO';
  const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 50);
  if (needsOptions && options.length === 0) {
    return { error: 'Add at least one option for a dropdown or choice question.' };
  }
  return {
    values: {
      label: label.slice(0, 160),
      type,
      required: input.required === true,
      options: needsOptions ? options : [],
      placeholder: input.placeholder?.trim().slice(0, 200) || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  };
}

export async function listServiceFieldsAction(serviceId: string): Promise<ServiceFieldRow[]> {
  const session = await requirePermission('service.manage');
  const rows = await repositoriesFor(session.user.businessId).customFields.listForService(serviceId);
  return rows.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type as CustomFieldType,
    required: f.required,
    options: optionsToArray(f.options),
    placeholder: f.placeholder,
    sortOrder: f.sortOrder,
    isActive: f.isActive,
  }));
}

export async function createServiceFieldAction(
  serviceId: string,
  input: ServiceFieldInput,
): Promise<FieldMutationResult> {
  const session = await requirePermission('service.manage');
  if (!serviceId) return { ok: false, error: 'Missing service.' };
  const parsed = sanitise(input);
  if (!parsed.values) return { ok: false, error: parsed.error };
  try {
    const repos = repositoriesFor(session.user.businessId);
    const field = await repos.customFields.create({ serviceId, ...parsed.values });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'service.field.create',
      entity: 'CustomField',
      entityId: field.id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('service.field.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not add the question. Please try again.' };
  }
}

export async function updateServiceFieldAction(id: string, input: ServiceFieldInput): Promise<FieldMutationResult> {
  const session = await requirePermission('service.manage');
  if (!id) return { ok: false, error: 'Missing question.' };
  const parsed = sanitise(input);
  if (!parsed.values) return { ok: false, error: parsed.error };
  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.customFields.getById(id);
  if (!existing) return { ok: false, error: 'That question could not be found.' };
  try {
    await repos.customFields.update(id, parsed.values);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'service.field.update',
      entity: 'CustomField',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('service.field.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the question. Please try again.' };
  }
}

export async function deleteServiceFieldAction(id: string): Promise<FieldMutationResult> {
  const session = await requirePermission('service.manage');
  if (!id) return { ok: false, error: 'Missing question.' };
  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.customFields.getById(id);
  if (!existing) return { ok: false, error: 'That question could not be found.' };
  try {
    await repos.customFields.delete(id);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'service.field.delete',
      entity: 'CustomField',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('service.field.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the question. Please try again.' };
  }
}
