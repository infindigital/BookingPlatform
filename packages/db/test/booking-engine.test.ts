import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BookingConflictError, ValidationError } from '@booking/core';
import { createBooking } from '../src/booking/create-booking';
import { transitionBooking } from '../src/booking/transition';
import { rescheduleBooking } from '../src/booking/reschedule';

const prisma = new PrismaClient();

let businessId = '';
let otherBusinessId = '';
let serviceId = '';
let customerId = '';
let employeeId = '';

function slot(dayOffset: number, hour: number, minutes = 60) {
  const startAt = new Date(Date.UTC(2031, 2, 3 + dayOffset, hour, 0, 0));
  return { startAt, endAt: new Date(startAt.getTime() + minutes * 60000) };
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `eng-${Date.now()}`, name: 'Eng Co' } });
  businessId = biz.id;
  const other = await prisma.business.create({ data: { slug: `eng2-${Date.now()}`, name: 'Other' } });
  otherBusinessId = other.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'S', durationMinutes: 60 } })).id;
  customerId = (
    await prisma.customer.create({ data: { businessId, firstName: 'C', lastName: 'One', email: 'c@eng.local' } })
  ).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'E', lastName: 'One' } })).id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
  await prisma.$disconnect();
});

describe('transitionBooking (state-machine guarded)', () => {
  it('applies a legal transition and rejects an illegal one', async () => {
    const { startAt, endAt } = slot(0, 9);
    const b = await createBooking(
      { businessId, customerId, serviceId, startAt, endAt, status: 'PENDING' },
      prisma,
    );
    const res = await transitionBooking(businessId, b.id, 'ACCEPTED', prisma);
    expect(res).toMatchObject({ from: 'PENDING', to: 'ACCEPTED' });

    // ACCEPTED -> PENDING is not a legal edge.
    await expect(transitionBooking(businessId, b.id, 'PENDING', prisma)).rejects.toBeInstanceOf(ValidationError);
    // Legal onward transition.
    const done = await transitionBooking(businessId, b.id, 'COMPLETED', prisma);
    expect(done.to).toBe('COMPLETED');
  });

  it('does not cross tenants', async () => {
    const { startAt, endAt } = slot(1, 9);
    const b = await createBooking(
      { businessId, customerId, serviceId, startAt, endAt, status: 'PENDING' },
      prisma,
    );
    await expect(transitionBooking(otherBusinessId, b.id, 'ACCEPTED', prisma)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('rescheduleBooking', () => {
  it('moves a booking to a free time and marks it RESCHEDULED', async () => {
    const { startAt, endAt } = slot(2, 9);
    const b = await createBooking(
      { businessId, customerId, serviceId, employeeId, startAt, endAt, status: 'ACCEPTED' },
      prisma,
    );
    const target = slot(2, 14);
    const res = await rescheduleBooking(businessId, b.id, { startAt: target.startAt, endAt: target.endAt }, prisma);
    expect(res.to).toBe('RESCHEDULED');
    const after = await prisma.booking.findUnique({ where: { id: b.id }, select: { startAt: true, status: true } });
    expect(after?.startAt.toISOString()).toBe(target.startAt.toISOString());
    expect(after?.status).toBe('RESCHEDULED');
  });

  it('rejects a reschedule that collides with the same employee', async () => {
    // Two bookings for one employee at different times…
    const a = await createBooking(
      { businessId, customerId, serviceId, employeeId, ...slot(3, 9), status: 'ACCEPTED' },
      prisma,
    );
    const b = await createBooking(
      { businessId, customerId, serviceId, employeeId, ...slot(3, 11), status: 'ACCEPTED' },
      prisma,
    );
    // …moving b onto a's slot must conflict.
    await expect(
      rescheduleBooking(businessId, b.id, { ...slot(3, 9) }, prisma),
    ).rejects.toBeInstanceOf(BookingConflictError);
    // a itself can be nudged within its own slot (excludes itself from the check).
    const nudged = await rescheduleBooking(businessId, a.id, { ...slot(3, 9, 90) }, prisma);
    expect(nudged.to).toBe('RESCHEDULED');
  });

  it('refuses to reschedule a terminal booking', async () => {
    const b = await createBooking(
      { businessId, customerId, serviceId, employeeId, ...slot(4, 9), status: 'ACCEPTED' },
      prisma,
    );
    await transitionBooking(businessId, b.id, 'CANCELLED', prisma);
    await expect(rescheduleBooking(businessId, b.id, { ...slot(4, 15) }, prisma)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
