'use server';

import { revalidatePath } from 'next/cache';
import { repositoriesFor, writeAudit, getCustomerDetail, type CustomerDetail } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface CustomerActionState {
  ok: boolean;
  error?: string;
  customerId?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function refresh(): void {
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
}

/** Load a full CRM profile on demand (customer detail drawer). */
export async function loadCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const session = await requirePermission('customer.manage');
  if (!customerId) return null;
  return getCustomerDetail(session.user.businessId, customerId);
}

export async function createCustomerAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const session = await requirePermission('customer.manage');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!firstName) return { ok: false, error: 'A first name is required.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required.' };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.customers.getByEmail(email);
  if (existing) return { ok: false, error: 'A customer with that email already exists.' };

  try {
    const customer = await repos.customers.create({ firstName, lastName, email, phone: phone || null });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'customer.create',
      entity: 'Customer',
      entityId: customer.id,
    });
    refresh();
    return { ok: true, customerId: customer.id };
  } catch (error) {
    logger.error('customer.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the customer. Please try again.' };
  }
}

export async function updateCustomerAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const session = await requirePermission('customer.manage');
  const id = String(formData.get('customerId') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!id) return { ok: false, error: 'Missing customer.' };
  if (!firstName) return { ok: false, error: 'A first name is required.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required.' };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.customers.getByEmail(email);
  if (existing && existing.id !== id) return { ok: false, error: 'Another customer already uses that email.' };

  try {
    await repos.customers.update(id, { firstName, lastName, email, phone: phone || null });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'customer.update',
      entity: 'Customer',
      entityId: id,
    });
    refresh();
    return { ok: true, customerId: id };
  } catch (error) {
    logger.error('customer.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the customer. Please try again.' };
  }
}

export async function addCustomerNoteAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const session = await requirePermission('customer.manage');
  const customerId = String(formData.get('customerId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!customerId || !body) return { ok: false, error: 'Write a note first.' };

  const repos = repositoriesFor(session.user.businessId);
  // Ensure the customer belongs to this tenant before attaching a note.
  const customer = await repos.customers.getById(customerId);
  if (!customer) return { ok: false, error: 'That customer could not be found.' };

  await repos.customers.addNote({ customerId, authorUserId: session.user.id, body });
  await writeAudit({
    businessId: session.user.businessId,
    actorUserId: session.user.id,
    action: 'customer.note',
    entity: 'Customer',
    entityId: customerId,
  });
  refresh();
  return { ok: true, customerId };
}
