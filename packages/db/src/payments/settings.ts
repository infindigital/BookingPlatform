import type { Prisma, PrismaClient } from '@prisma/client';
import { resolvePaymentSettings, DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from '@booking/core';
import { prisma } from '../client';

/** Load a business's payment policy, resolved + clamped. Falls back to NONE. */
export async function loadPaymentSettings(businessId: string, db: PrismaClient = prisma): Promise<PaymentSettings> {
  const row = await db.paymentSettings.findUnique({ where: { businessId } });
  if (!row) return { ...DEFAULT_PAYMENT_SETTINGS };
  return resolvePaymentSettings({
    mode: row.mode,
    depositType: row.depositType,
    depositValue: Number(row.depositValue),
    currency: row.currency,
    instructions: row.instructions,
    methods: row.methods,
  });
}

/** Persist a business's payment policy (upsert), returning the resolved value. */
export async function savePaymentSettings(
  businessId: string,
  input: unknown,
  db: PrismaClient = prisma,
): Promise<PaymentSettings> {
  const s = resolvePaymentSettings(input);
  const data = {
    mode: s.mode,
    depositType: s.depositType,
    depositValue: s.depositValue,
    currency: s.currency,
    instructions: s.instructions,
    methods: s.methods as unknown as Prisma.InputJsonValue,
  };
  await db.paymentSettings.upsert({
    where: { businessId },
    update: data,
    create: { businessId, ...data },
  });
  return s;
}
