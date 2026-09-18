import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BookingConflictError, ValidationError } from '@booking/core';
import { getPublicBookingData } from '../src/public/booking-data';
import { createPublicBooking } from '../src/public/create-public-booking';

const prisma = new PrismaClient();

let slug = '';
let businessId = '';
let serviceId = '';
let employeeId = '';

const DAY = '2031-06-04'; // a Wednesday
const weekday = new Date(Date.UTC(2031, 5, 4)).getUTCDay();

beforeAll(async () => {
  slug = `pub-${Date.now()}`;
  const biz = await prisma.business.create({
    data: { slug, name: 'Public Co', timezone: 'UTC', currency: 'USD', email: 'hi@public.local' },
  });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Consult', durationMinutes: 60 } })).id;
  // An inactive service must never surface publicly.
  await prisma.service.create({ data: { businessId, name: 'Retired', durationMinutes: 30, isActive: false } });
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'Pat', lastName: 'Doe', title: 'Stylist' } })).id;
  await prisma.employeeService.create({ data: { businessId, employeeId, serviceId } });
  await prisma.employeeWorkingHours.create({
    data: { businessId, employeeId, dayOfWeek: weekday, startTime: '09:00', endTime: '17:00' },
  });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('getPublicBookingData', () => {
  it('returns the business, active services and employees (hiding inactive services)', async () => {
    const data = await getPublicBookingData(slug, prisma);
    expect(data).not.toBeNull();
    expect(data!.business.name).toBe('Public Co');
    expect(data!.services.map((s) => s.name)).toEqual(['Consult']); // "Retired" excluded
    expect(data!.services[0]?.durationMinutes).toBe(60);
    expect(data!.employees[0]?.name).toBe('Pat Doe');
    expect(data!.employees[0]?.serviceIds).toContain(serviceId);
  });

  it('returns null for an unknown slug', async () => {
    expect(await getPublicBookingData('does-not-exist', prisma)).toBeNull();
  });
});

describe('createPublicBooking', () => {
  it('creates a PENDING booking, auto-assigns a free employee and upserts the customer', async () => {
    const conf = await createPublicBooking(
      {
        slug,
        serviceId,
        dayKey: DAY,
        time: '10:00',
        customer: { firstName: 'Sam', lastName: 'Lee', email: 'SAM@example.com', phone: '+1 555' },
      },
      prisma,
    );
    expect(conf.status).toBe('PENDING');
    expect(conf.startISO).toBe(`${DAY}T10:00:00.000Z`);
    expect(conf.employeeName).toBe('Pat Doe');
    expect(conf.reference).toHaveLength(8);

    const booking = await prisma.booking.findUnique({ where: { id: conf.id } });
    expect(booking?.status).toBe('PENDING');
    expect(booking?.source).toBe('public');
    expect(booking?.employeeId).toBe(employeeId);

    // Customer upserted (email normalised to lowercase).
    const customer = await prisma.customer.findFirst({ where: { businessId, email: 'sam@example.com' } });
    expect(customer?.firstName).toBe('Sam');
  });

  it('rejects a time outside working hours', async () => {
    await expect(
      createPublicBooking(
        { slug, serviceId, dayKey: DAY, time: '20:00', customer: { firstName: 'A', lastName: 'B', email: 'a@b.com' } },
        prisma,
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  it('rejects a slot already taken (double-book prevention)', async () => {
    // 10:00 is now booked from the first test; a second attempt at 10:00 must fail.
    await expect(
      createPublicBooking(
        { slug, serviceId, dayKey: DAY, time: '10:00', customer: { firstName: 'C', lastName: 'D', email: 'c@d.com' } },
        prisma,
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  it('rejects an invalid email before touching the schedule', async () => {
    await expect(
      createPublicBooking(
        { slug, serviceId, dayKey: DAY, time: '11:00', customer: { firstName: 'C', lastName: 'D', email: 'not-an-email' } },
        prisma,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects oversized public input (defence in depth)', async () => {
    await expect(
      createPublicBooking(
        {
          slug,
          serviceId,
          dayKey: DAY,
          time: '11:00',
          customer: { firstName: 'C', lastName: 'D', email: 'big@example.com' },
          notes: 'x'.repeat(2001),
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
