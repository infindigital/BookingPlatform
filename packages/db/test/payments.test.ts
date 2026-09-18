import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ValidationError } from '@booking/core';
import { createBooking } from '../src/booking/create-booking';
import { loadPaymentSettings, savePaymentSettings } from '../src/payments/settings';
import { ensurePaymentForBooking } from '../src/payments/create';
import { PaymentRepository } from '../src/payments/payment.repository';
import { getPaymentsList } from '../src/payments/read';

const prisma = new PrismaClient();

let businessId = '';
let otherBusinessId = '';
let serviceId = '';
let customerId = '';

async function newBooking(price = 100): Promise<string> {
  const start = new Date('2031-10-01T10:00:00Z');
  const b = await createBooking(
    {
      businessId,
      customerId,
      serviceId,
      startAt: start,
      endAt: new Date(start.getTime() + 60 * 60_000),
      status: 'ACCEPTED',
      priceTotal: price,
      currency: 'USD',
    },
    prisma,
  );
  return b.id;
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `pay-${Date.now()}`, name: 'Pay Co', currency: 'USD' } });
  businessId = biz.id;
  const other = await prisma.business.create({ data: { slug: `pay2-${Date.now()}`, name: 'Other Co', currency: 'USD' } });
  otherBusinessId = other.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Facial', durationMinutes: 60, price: 100 } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'Nia', lastName: 'Fox', email: 'nia@pay.local' } })).id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.paymentTransaction.deleteMany({ where: { businessId } });
  await prisma.payment.deleteMany({ where: { businessId } });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.paymentSettings.deleteMany({ where: { businessId } });
});

describe('payment settings', () => {
  it('defaults to a NONE policy when unset', async () => {
    const s = await loadPaymentSettings(businessId, prisma);
    expect(s.mode).toBe('NONE');
  });

  it('saves and reloads a clamped deposit policy', async () => {
    await savePaymentSettings(businessId, { mode: 'DEPOSIT', depositType: 'PERCENT', depositValue: 250, methods: ['card', 'cash'] }, prisma);
    const s = await loadPaymentSettings(businessId, prisma);
    expect(s.mode).toBe('DEPOSIT');
    expect(s.depositValue).toBe(100); // clamped from 250
    expect(s.methods).toEqual(['cash', 'card']);
  });
});

describe('ensurePaymentForBooking', () => {
  it('creates no payment under a NONE policy', async () => {
    await savePaymentSettings(businessId, { mode: 'NONE' }, prisma);
    const bookingId = await newBooking(100);
    const res = await ensurePaymentForBooking(businessId, bookingId, { price: 100, currency: 'USD' }, prisma);
    expect(res).toBeNull();
    expect(await prisma.payment.count({ where: { businessId } })).toBe(0);
  });

  it('creates a full-price UNPAID payment under a FULL policy', async () => {
    await savePaymentSettings(businessId, { mode: 'FULL' }, prisma);
    const bookingId = await newBooking(100);
    const res = await ensurePaymentForBooking(businessId, bookingId, { price: 100, currency: 'USD' }, prisma);
    expect(res).toEqual({ amountDue: 100 });
    const p = await prisma.payment.findFirst({ where: { businessId, bookingId } });
    expect(Number(p!.amount)).toBe(100);
    expect(p!.status).toBe('UNPAID');
    expect(p!.provider).toBe('manual');
  });

  it('creates a deposit-sized payment under a DEPOSIT policy and is idempotent', async () => {
    await savePaymentSettings(businessId, { mode: 'DEPOSIT', depositType: 'PERCENT', depositValue: 30 }, prisma);
    const bookingId = await newBooking(100);
    await ensurePaymentForBooking(businessId, bookingId, { price: 100, currency: 'USD' }, prisma);
    await ensurePaymentForBooking(businessId, bookingId, { price: 100, currency: 'USD' }, prisma); // again
    const payments = await prisma.payment.findMany({ where: { businessId, bookingId } });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0]!.amount)).toBe(30);
  });
});

describe('PaymentRepository ledger', () => {
  async function seedPayment(amount = 100): Promise<string> {
    await savePaymentSettings(businessId, { mode: 'FULL' }, prisma);
    const bookingId = await newBooking(amount);
    await ensurePaymentForBooking(businessId, bookingId, { price: amount, currency: 'USD' }, prisma);
    const p = await prisma.payment.findFirst({ where: { businessId, bookingId } });
    return p!.id;
  }

  it('records a partial charge → PARTIALLY_PAID', async () => {
    const repo = new PaymentRepository(businessId, prisma);
    const id = await seedPayment(100);
    const updated = await repo.recordCharge({ paymentId: id, amount: 40, method: 'cash' });
    expect(updated!.status).toBe('PARTIALLY_PAID');
    expect(Number(updated!.amountPaid)).toBe(40);
  });

  it('records enough charges to reach PAID', async () => {
    const repo = new PaymentRepository(businessId, prisma);
    const id = await seedPayment(100);
    await repo.recordCharge({ paymentId: id, amount: 60, method: 'cash' });
    const updated = await repo.recordCharge({ paymentId: id, amount: 40, method: 'card' });
    expect(updated!.status).toBe('PAID');
    expect(Number(updated!.amountPaid)).toBe(100);
    expect(updated!.transactions).toHaveLength(2);
  });

  it('rejects a refund larger than the net collected', async () => {
    const repo = new PaymentRepository(businessId, prisma);
    const id = await seedPayment(100);
    await repo.recordCharge({ paymentId: id, amount: 30, method: 'cash' });
    await expect(repo.recordRefund({ paymentId: id, amount: 50 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('full refund → REFUNDED, then re-derives on partial', async () => {
    const repo = new PaymentRepository(businessId, prisma);
    const id = await seedPayment(100);
    await repo.recordCharge({ paymentId: id, amount: 100, method: 'card' });
    const refunded = await repo.recordRefund({ paymentId: id, amount: 100 });
    expect(refunded!.status).toBe('REFUNDED');
    expect(Number(refunded!.amountPaid)).toBe(0);
  });

  it('rejects a zero/negative amount', async () => {
    const repo = new PaymentRepository(businessId, prisma);
    const id = await seedPayment(100);
    await expect(repo.recordCharge({ paymentId: id, amount: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('is tenant-scoped: another business cannot touch the payment', async () => {
    const id = await seedPayment(100);
    const foreign = new PaymentRepository(otherBusinessId, prisma);
    const res = await foreign.recordCharge({ paymentId: id, amount: 10 });
    expect(res).toBeNull();
    const stillUnpaid = await prisma.payment.findUnique({ where: { id } });
    expect(Number(stillUnpaid!.amountPaid)).toBe(0);
  });
});

describe('getPaymentsList', () => {
  it('reports rows, status facets and money summary', async () => {
    await savePaymentSettings(businessId, { mode: 'FULL' }, prisma);
    const repo = new PaymentRepository(businessId, prisma);

    const b1 = await newBooking(100);
    await ensurePaymentForBooking(businessId, b1, { price: 100, currency: 'USD' }, prisma);
    const p1 = (await prisma.payment.findFirst({ where: { businessId, bookingId: b1 } }))!;
    await repo.recordCharge({ paymentId: p1.id, amount: 100, method: 'card' }); // PAID
    await repo.recordRefund({ paymentId: p1.id, amount: 25 }); // partial refund

    const b2 = await newBooking(50);
    await ensurePaymentForBooking(businessId, b2, { price: 50, currency: 'USD' }, prisma); // UNPAID, outstanding 50

    const list = await getPaymentsList(businessId, {}, prisma);
    expect(list.total).toBe(2);
    expect(list.summary.collected).toBe(75); // 100 charged - 25 refunded
    expect(list.summary.refunded).toBe(25);
    // b1: amount 100, paid 75 → outstanding 25; b2: amount 50, paid 0 → outstanding 50; total 75
    expect(list.summary.outstanding).toBe(75);
    expect(list.rows.every((r) => typeof r.reference === 'string' && r.reference.length === 8)).toBe(true);
  });
});
