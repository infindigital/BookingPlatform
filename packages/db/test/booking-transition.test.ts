import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ValidationError } from '@booking/core';
import { createBooking } from '../src/booking/create-booking';
import { setBookingStatus } from '../src/booking/transition';
import { getDashboardMetrics } from '../src/dashboard/metrics';

const prisma = new PrismaClient();

let businessId = '';
let otherBusinessId = '';
let serviceId = '';
let customerId = '';

const TODAY = new Date();
/** A slot at a fixed hour today (UTC) so it lands in the "today" window. */
function slotToday(hour: number, minutes = 60): { start: Date; end: Date } {
  const start = new Date(TODAY);
  start.setUTCHours(hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + minutes * 60000) };
}

beforeAll(async () => {
  const biz = await prisma.business.create({
    data: { slug: `txn-${Date.now()}`, name: 'Txn Co', timezone: 'UTC', currency: 'USD' },
  });
  businessId = biz.id;
  const other = await prisma.business.create({
    data: { slug: `txn2-${Date.now()}`, name: 'Other Co', timezone: 'UTC' },
  });
  otherBusinessId = other.id;

  const svc = await prisma.service.create({
    data: { businessId, name: 'Consult', durationMinutes: 60, price: 100 },
  });
  serviceId = svc.id;
  const cust = await prisma.customer.create({
    data: { businessId, firstName: 'Pat', lastName: 'Lee', email: 'pat@txn.local' },
  });
  customerId = cust.id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
  await prisma.$disconnect();
});

describe('setBookingStatus — guarded transition', () => {
  it('approves a PENDING booking (PENDING → ACCEPTED)', async () => {
    const { start, end } = slotToday(9);
    const b = await createBooking(
      { businessId, customerId, serviceId, startAt: start, endAt: end, status: 'PENDING', priceTotal: 100 },
      prisma,
    );
    const res = await setBookingStatus(businessId, b.id, 'ACCEPTED', ['PENDING'], prisma);
    expect(res).toMatchObject({ from: 'PENDING', to: 'ACCEPTED' });
    const after = await prisma.booking.findUnique({ where: { id: b.id }, select: { status: true } });
    expect(after?.status).toBe('ACCEPTED');
  });

  it('refuses to change a booking whose status is not in allowedFrom', async () => {
    const { start, end } = slotToday(10);
    const b = await createBooking(
      { businessId, customerId, serviceId, startAt: start, endAt: end, status: 'ACCEPTED' },
      prisma,
    );
    await expect(
      setBookingStatus(businessId, b.id, 'REJECTED', ['PENDING'], prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await prisma.booking.findUnique({ where: { id: b.id }, select: { status: true } });
    expect(after?.status).toBe('ACCEPTED'); // unchanged
  });

  it('does not act across tenants (booking of another business is not found)', async () => {
    const { start, end } = slotToday(11);
    const b = await createBooking(
      { businessId, customerId, serviceId, startAt: start, endAt: end, status: 'PENDING' },
      prisma,
    );
    await expect(
      setBookingStatus(otherBusinessId, b.id, 'ACCEPTED', ['PENDING'], prisma),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await prisma.booking.findUnique({ where: { id: b.id }, select: { status: true } });
    expect(after?.status).toBe('PENDING'); // untouched by the wrong tenant
  });
});

describe('getDashboardMetrics — scoped aggregation', () => {
  it('counts only this tenant and reflects pending/today figures', async () => {
    // Seed a distinct pending booking for the other tenant that must NOT leak in.
    const otherSvc = await prisma.service.create({
      data: { businessId: otherBusinessId, name: 'X', durationMinutes: 30 },
    });
    const otherCust = await prisma.customer.create({
      data: { businessId: otherBusinessId, firstName: 'Q', lastName: 'Z', email: 'q@txn.local' },
    });
    const { start, end } = slotToday(14, 30);
    await createBooking(
      { businessId: otherBusinessId, customerId: otherCust.id, serviceId: otherSvc.id, startAt: start, endAt: end, status: 'PENDING' },
      prisma,
    );

    const data = await getDashboardMetrics(businessId, { now: TODAY, timeZone: 'UTC' }, prisma);

    // This tenant has 3 bookings created above (09 ACCEPTED, 10 ACCEPTED, 11 PENDING).
    expect(data.kpis.pendingCount).toBe(1);
    expect(data.kpis.todayCount).toBe(3);
    // Revenue this month counts the ACCEPTED booking(s) with a price (the 09:00 one = 100).
    expect(data.kpis.revenueMonth).toBeGreaterThanOrEqual(100);
    // Nothing from the other tenant is present.
    for (const b of [...data.today, ...data.pending, ...data.recent]) {
      expect(b.customerName).not.toContain('Q ');
    }
  });
});
