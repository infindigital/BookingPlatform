import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getAnalytics } from '../src/analytics/read';

const prisma = new PrismaClient();

let businessId = '';
let haircutId = '';
let colorId = '';
let emmaId = '';
let noahId = '';
let c1 = '';
let c2 = '';

const FROM = '2031-03-01';
const TO = '2031-03-31';

function at(day: string, hour = 10): Date {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`);
}

async function booking(day: string, status: string, serviceId: string, employeeId: string | null, customerId: string, price: number, source: string | null) {
  return prisma.booking.create({
    data: {
      businessId,
      customerId,
      serviceId,
      employeeId,
      status: status as never,
      startAt: at(day),
      endAt: at(day, 11),
      priceTotal: price,
      currency: 'USD',
      source,
    },
  });
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `an-${Date.now()}`, name: 'Analytics Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  haircutId = (await prisma.service.create({ data: { businessId, name: 'Haircut', durationMinutes: 60, price: 100 } })).id;
  colorId = (await prisma.service.create({ data: { businessId, name: 'Color', durationMinutes: 60, price: 200 } })).id;
  emmaId = (await prisma.employee.create({ data: { businessId, firstName: 'Emma', lastName: 'Stone' } })).id;
  noahId = (await prisma.employee.create({ data: { businessId, firstName: 'Noah', lastName: 'Kim' } })).id;
  c1 = (await prisma.customer.create({ data: { businessId, firstName: 'C', lastName: 'One', email: 'c1@an.local', createdAt: at('2031-03-02') } })).id;
  c2 = (await prisma.customer.create({ data: { businessId, firstName: 'C', lastName: 'Two', email: 'c2@an.local', createdAt: at('2031-03-03') } })).id;

  await booking('2031-03-05', 'COMPLETED', haircutId, emmaId, c1, 100, 'widget');
  const acc = await booking('2031-03-05', 'ACCEPTED', colorId, emmaId, c2, 200, 'admin');
  await booking('2031-03-10', 'COMPLETED', haircutId, noahId, c1, 100, 'widget');
  await booking('2031-03-10', 'CANCELLED', haircutId, emmaId, c2, 100, 'api');
  await booking('2031-03-12', 'NO_SHOW', colorId, noahId, c1, 200, 'widget');
  await booking('2031-03-12', 'PENDING', haircutId, null, c2, 100, null);

  // A payment ledger for the collected-revenue series: +150 on 03-05, −50 on 03-06.
  const payment = await prisma.payment.create({
    data: { businessId, bookingId: acc.id, amount: 200, amountPaid: 150, status: 'PARTIALLY_PAID', provider: 'manual', currency: 'USD' },
  });
  await prisma.paymentTransaction.create({ data: { businessId, paymentId: payment.id, type: 'CHARGE', amount: 150, createdAt: at('2031-03-05', 12) } });
  await prisma.paymentTransaction.create({ data: { businessId, paymentId: payment.id, type: 'REFUND', amount: 50, createdAt: at('2031-03-06', 12) } });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('getAnalytics', () => {
  it('summarises the range from real bookings and the ledger', async () => {
    const a = await getAnalytics(businessId, { fromDayKey: FROM, toDayKey: TO, timeZone: 'UTC' }, prisma);
    expect(a.granularity).toBe('day');
    expect(a.summary.bookings).toBe(6);
    expect(a.summary.completed).toBe(2);
    expect(a.summary.noShow).toBe(1);
    expect(a.summary.cancelled).toBe(1);
    // completed 2 / (completed 2 + no-show 1) = 0.666…
    expect(a.summary.completionRate).toBeCloseTo(2 / 3, 5);
    // booked revenue = ACCEPTED + COMPLETED = 100 + 200 + 100
    expect(a.summary.bookedRevenue).toBe(400);
    // collected = 150 charged − 50 refunded
    expect(a.summary.collectedRevenue).toBe(100);
    expect(a.summary.uniqueCustomers).toBe(2);
    expect(a.summary.newCustomers).toBe(2);
    expect(a.summary.currency).toBe('USD');
  });

  it('buckets a daily series with booked and collected revenue', async () => {
    const a = await getAnalytics(businessId, { fromDayKey: FROM, toDayKey: TO, timeZone: 'UTC' }, prisma);
    expect(a.series).toHaveLength(31);
    const on = (day: string) => a.series.find((p) => p.bucket === day)!;
    expect(on('2031-03-05')).toMatchObject({ bookings: 2, bookedRevenue: 300, collectedRevenue: 150 });
    expect(on('2031-03-06')).toMatchObject({ bookings: 0, bookedRevenue: 0, collectedRevenue: -50 });
    expect(on('2031-03-10')).toMatchObject({ bookings: 2, bookedRevenue: 100 });
    expect(on('2031-03-12')).toMatchObject({ bookings: 2, bookedRevenue: 0 });
  });

  it('breaks down by status, service, staff and source', async () => {
    const a = await getAnalytics(businessId, { fromDayKey: FROM, toDayKey: TO, timeZone: 'UTC' }, prisma);

    const status = Object.fromEntries(a.byStatus.map((s) => [s.status, s.count]));
    expect(status).toMatchObject({ COMPLETED: 2, ACCEPTED: 1, CANCELLED: 1, NO_SHOW: 1, PENDING: 1, REJECTED: 0, RESCHEDULED: 0 });

    expect(a.topServices[0]).toMatchObject({ label: 'Haircut', count: 4, revenue: 200 });
    expect(a.topServices.find((s) => s.label === 'Color')).toMatchObject({ count: 2, revenue: 200 });

    expect(a.topEmployees[0]).toMatchObject({ label: 'Emma Stone', count: 3, revenue: 300 });
    expect(a.topEmployees.find((e) => e.label === 'Unassigned')).toMatchObject({ count: 1 });

    const widget = a.bySource.find((s) => s.key === 'widget')!;
    expect(widget).toMatchObject({ label: 'Online widget', count: 3, revenue: 200 });
    expect(a.bySource.find((s) => s.key === 'unknown')).toMatchObject({ count: 1 });
  });

  it('chooses a coarser granularity for a long range', async () => {
    const a = await getAnalytics(businessId, { fromDayKey: '2031-01-01', toDayKey: '2031-12-31', timeZone: 'UTC' }, prisma);
    expect(a.granularity).toBe('month');
    expect(a.series).toHaveLength(12);
    // All the March bookings land in the March bucket.
    expect(a.series.find((p) => p.bucket === '2031-03-01')?.bookings).toBe(6);
  });

  it('is tenant-scoped: another business sees nothing', async () => {
    const a = await getAnalytics('non-existent-biz', { fromDayKey: FROM, toDayKey: TO, timeZone: 'UTC' }, prisma);
    expect(a.summary.bookings).toBe(0);
    expect(a.summary.bookedRevenue).toBe(0);
  });
});
