import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BookingConflictError } from '@booking/core';
import { createBooking } from '../src/booking/create-booking';
import { repositoriesFor } from '../src/repositories/index';

const prisma = new PrismaClient();

// Isolated fixture business so the test never depends on / mutates demo data.
let businessId = '';
let employeeId = '';
let serviceId = '';
let customerId = '';
const otherBusiness = { id: '', bookingId: '' };

const slot = () => {
  const start = new Date(Date.UTC(2030, 0, 7, 10, 0, 0)); // fixed future slot
  return { start, end: new Date(start.getTime() + 60 * 60000) };
};

beforeAll(async () => {
  const biz = await prisma.business.create({
    data: { slug: `test-${Date.now()}`, name: 'Test Co' },
  });
  businessId = biz.id;
  const emp = await prisma.employee.create({
    data: { businessId, firstName: 'Test', lastName: 'Emp' },
  });
  employeeId = emp.id;
  const svc = await prisma.service.create({
    data: { businessId, name: 'Test Service', durationMinutes: 60 },
  });
  serviceId = svc.id;
  const cust = await prisma.customer.create({
    data: { businessId, firstName: 'C', lastName: 'One', email: 'c1@test.local' },
  });
  customerId = cust.id;

  // A second tenant, for isolation checks.
  const biz2 = await prisma.business.create({
    data: { slug: `test2-${Date.now()}`, name: 'Other Co' },
  });
  otherBusiness.id = biz2.id;
  const cust2 = await prisma.customer.create({
    data: { businessId: biz2.id, firstName: 'D', lastName: 'Two', email: 'd@test.local' },
  });
  const svc2 = await prisma.service.create({
    data: { businessId: biz2.id, name: 'Other Service', durationMinutes: 30 },
  });
  const b2 = await createBooking(
    {
      businessId: biz2.id,
      customerId: cust2.id,
      serviceId: svc2.id,
      startAt: new Date(Date.UTC(2030, 0, 8, 10, 0, 0)),
      endAt: new Date(Date.UTC(2030, 0, 8, 10, 30, 0)),
    },
    prisma,
  );
  otherBusiness.bookingId = b2.id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusiness.id] } } });
  await prisma.$disconnect();
});

describe('createBooking — double-booking prevention', () => {
  it('allows a booking into a free slot', async () => {
    const { start, end } = slot();
    const b = await createBooking(
      { businessId, customerId, serviceId, employeeId, startAt: start, endAt: end },
      prisma,
    );
    expect(b.id).toBeTruthy();
  });

  it('rejects an overlapping booking for the same employee', async () => {
    const { start, end } = slot();
    await expect(
      createBooking(
        {
          businessId,
          customerId,
          serviceId,
          employeeId,
          startAt: new Date(start.getTime() + 30 * 60000),
          endAt: new Date(end.getTime() + 30 * 60000),
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  it('allows a back-to-back booking (touching edges)', async () => {
    const { end } = slot();
    const b = await createBooking(
      {
        businessId,
        customerId,
        serviceId,
        employeeId,
        startAt: end,
        endAt: new Date(end.getTime() + 60 * 60000),
      },
      prisma,
    );
    expect(b.id).toBeTruthy();
  });

  it('under concurrency, exactly one of two racing identical bookings wins', async () => {
    // Fresh employee + slot to avoid interference with the sequential cases above.
    const emp = await prisma.employee.create({
      data: { businessId, firstName: 'Race', lastName: 'Emp' },
    });
    const start = new Date(Date.UTC(2030, 5, 1, 9, 0, 0));
    const end = new Date(start.getTime() + 60 * 60000);

    const attempt = () =>
      createBooking(
        { businessId, customerId, serviceId, employeeId: emp.id, startAt: start, endAt: end },
        prisma,
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BookingConflictError);

    const count = await prisma.booking.count({
      where: { businessId, employeeId: emp.id, startAt: start },
    });
    expect(count).toBe(1);
  });
});

describe('repository tenant isolation', () => {
  it('scoped repository cannot read another business\'s booking', async () => {
    const repos = repositoriesFor(businessId, prisma);
    const leaked = await repos.bookings.getById(otherBusiness.bookingId);
    expect(leaked).toBeNull();
  });

  it('scoped booking count only sees its own tenant', async () => {
    const repos = repositoriesFor(otherBusiness.id, prisma);
    const count = await repos.bookings.count();
    expect(count).toBe(1);
  });
});
