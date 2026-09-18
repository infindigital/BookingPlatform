import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ValidationError, BookingConflictError } from '@booking/core';
import { createBooking } from '../src/booking/create-booking';
import { lookupCustomerBookings, cancelOwnBooking, rescheduleOwnBooking } from '../src/public/manage';
import { referenceFor } from '../src/public/reference';

const prisma = new PrismaClient();

let slug = '';
let businessId = '';
let serviceId = '';
let employeeId = '';
let customerId = '';
let bookingId = '';
let reference = '';

const DAY = '2031-09-03'; // a Wednesday
const weekday = new Date(Date.UTC(2031, 8, 3)).getUTCDay();

beforeAll(async () => {
  slug = `mng-${Date.now()}`;
  const biz = await prisma.business.create({ data: { slug, name: 'Manage Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Cut', durationMinutes: 60, price: 50 } })).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'Ivy', lastName: 'Ng' } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'Sam', lastName: 'Doe', email: 'sam@mng.local' } })).id;
  await prisma.employeeService.create({ data: { businessId, employeeId, serviceId } });
  await prisma.employeeWorkingHours.create({ data: { businessId, employeeId, dayOfWeek: weekday, startTime: '09:00', endTime: '17:00' } });

  const b = await createBooking(
    { businessId, customerId, serviceId, employeeId, startAt: new Date(`${DAY}T10:00:00.000Z`), endAt: new Date(`${DAY}T11:00:00.000Z`), status: 'ACCEPTED', priceTotal: 50 },
    prisma,
  );
  bookingId = b.id;
  reference = referenceFor(b.id);
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('lookupCustomerBookings', () => {
  it('returns the customer bookings for a valid (email, reference) pair', async () => {
    const res = await lookupCustomerBookings(slug, 'SAM@mng.local', reference.toLowerCase(), prisma);
    expect(res).not.toBeNull();
    expect(res!.customerName).toBe('Sam Doe');
    expect(res!.bookings).toHaveLength(1);
    expect(res!.bookings[0]?.canCancel).toBe(true);
    expect(res!.bookings[0]?.canReschedule).toBe(true);
  });

  it('rejects a wrong reference or email (no enumeration)', async () => {
    expect(await lookupCustomerBookings(slug, 'sam@mng.local', 'WRONGREF', prisma)).toBeNull();
    expect(await lookupCustomerBookings(slug, 'nobody@mng.local', reference, prisma)).toBeNull();
  });
});

describe('rescheduleOwnBooking', () => {
  it('moves the booking to a valid new slot and sets RESCHEDULED', async () => {
    const res = await rescheduleOwnBooking(slug, 'sam@mng.local', reference, bookingId, DAY, '14:00', prisma);
    expect(res.startISO).toBe(`${DAY}T14:00:00.000Z`);
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.status).toBe('RESCHEDULED');
    expect(b?.startAt.toISOString()).toBe(`${DAY}T14:00:00.000Z`);
  });

  it('rejects a slot outside working hours', async () => {
    await expect(rescheduleOwnBooking(slug, 'sam@mng.local', reference, bookingId, DAY, '20:00', prisma)).rejects.toBeInstanceOf(
      BookingConflictError,
    );
  });

  it('rejects an unverified request', async () => {
    await expect(rescheduleOwnBooking(slug, 'sam@mng.local', 'BADREF00', bookingId, DAY, '15:00', prisma)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('cancelOwnBooking', () => {
  it('cancels an owned booking', async () => {
    await cancelOwnBooking(slug, 'sam@mng.local', reference, bookingId, prisma);
    const b = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(b?.status).toBe('CANCELLED');
  });

  it('is then no longer cancellable/reschedulable in lookup', async () => {
    const res = await lookupCustomerBookings(slug, 'sam@mng.local', reference, prisma);
    expect(res!.bookings[0]?.canCancel).toBe(false);
    expect(res!.bookings[0]?.status).toBe('CANCELLED');
  });
});
