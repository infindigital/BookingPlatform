'use server';

import { revalidatePath } from 'next/cache';
import {
  repositoriesFor,
  loadPaymentSettings as loadPaymentSettingsDb,
  savePaymentSettings as savePaymentSettingsDb,
  getPaymentsList,
  writeAudit,
  type PaymentsListFilters,
  type PaymentsListResult,
} from '@booking/db';
import { DomainError, type PaymentSettings } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface PaymentActionResult {
  ok: boolean;
  error?: string;
}

function refresh(): void {
  revalidatePath('/admin/payments');
}

export async function loadPayments(filters: PaymentsListFilters = {}): Promise<PaymentsListResult> {
  const session = await requirePermission('payment.manage');
  return getPaymentsList(session.user.businessId, filters);
}

export async function loadPaymentSettingsAction(): Promise<PaymentSettings> {
  const session = await requirePermission('payment.manage');
  return loadPaymentSettingsDb(session.user.businessId);
}

export interface SavePaymentSettingsInput {
  mode: string;
  depositType: string;
  depositValue: number;
  currency: string;
  instructions: string | null;
  methods: string[];
}

export async function savePaymentSettingsAction(input: SavePaymentSettingsInput): Promise<PaymentActionResult> {
  const session = await requirePermission('payment.manage');
  try {
    const saved = await savePaymentSettingsDb(session.user.businessId, input);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'payment.settings.update',
      entity: 'PaymentSettings',
      metadata: { mode: saved.mode, depositType: saved.depositType, depositValue: saved.depositValue },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    logger.error('payment.settings.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the payment settings.' };
  }
}

export interface RecordPaymentInput {
  paymentId: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
}

export async function recordPaymentAction(input: RecordPaymentInput): Promise<PaymentActionResult> {
  const session = await requirePermission('payment.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const updated = await repos.payments.recordCharge({
      paymentId: input.paymentId,
      amount: input.amount,
      method: input.method ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      actorUserId: session.user.id,
    });
    if (!updated) return { ok: false, error: 'Payment not found.' };
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'payment.charge',
      entity: 'Payment',
      entityId: input.paymentId,
      metadata: { amount: input.amount, method: input.method ?? null },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    logger.error('payment.charge.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not record the payment.' };
  }
}

export async function refundPaymentAction(input: RecordPaymentInput): Promise<PaymentActionResult> {
  const session = await requirePermission('payment.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const updated = await repos.payments.recordRefund({
      paymentId: input.paymentId,
      amount: input.amount,
      method: input.method ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      actorUserId: session.user.id,
    });
    if (!updated) return { ok: false, error: 'Payment not found.' };
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'payment.refund',
      entity: 'Payment',
      entityId: input.paymentId,
      metadata: { amount: input.amount, method: input.method ?? null },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    logger.error('payment.refund.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not record the refund.' };
  }
}
