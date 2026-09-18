import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createBooking } from '../src/booking/create-booking';
import { getAvailability } from '../src/availability/availability';

const prisma = new PrismaClient();

let businessId = '';
let serviceId = '';
let otherServiceId = '';
let employeeId = '';
let customerId = '';

const DAY = '2031-03-05';
const weekday = new Date(Date.UTC(2031, 2, 5)).getUTCDay();

function startsOn(result: { days: { dayKey: string; slots: { startISO: string }[] }[] }): string[] {
  const day = result.days.find((d) => d.dayKey === DAY);
  return (day?.slots ?? []).map((s) => s.startISO.slice(11, 16)); // HH:MM (UTC)
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `avail-${Date.now()}`, name: 'Avail Co', timezone: 'UTC' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Svc', durationMinutes: 60 } })).id;
  otherServiceId = (await prisma.service.create({ data: { businessId, name: 'Other', durationMinutes: 30 } })).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'E', lastName: '1' } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'C', lastName: '1', email: 'c@avail.local' } })).id;

  await prisma.employeeService.create({ data: { businessId, employeeId, serviceId } });

  // Working 09:00–17:00 with a 12:00–13:00 lunch break on the target weekday.
  const wh = await prisma.employeeWorkingHours.create({
    data: { businessId, employeeId, dayOfWeek: weekday, startTime: '09:00', endTime: '17:00' },
  });
  await prisma.break.create({ data: { businessId, employeeWorkingHoursId: wh.id, startTime: '12:00', endTime: '13:00' } });

  // An existing booking 10:00–11:00.
  await createBooking(
    {
      businessId,
      customerId,
      serviceId,
      employeeId,
      startAt: new Date(`${DAY}T10:00:00.000Z`),
      endAt: new Date(`${DAY}T11:00:00.000Z`),
      status: 'ACCEPTED',
    },
    prisma,
  );
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('getAvailability', () => {
  it('generates hourly slots around the break and the existing booking', async () => {
    const result = await getAvailability(
      businessId,
      { serviceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 },
      prisma,
    );
    expect(result.durationMinutes).toBe(60);
    // 09 (10 booked out), 11 (up to lunch), then 13–16 after lunch.
    expect(startsOn(result)).toEqual(['09:00', '11:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('returns each slot with the employee that can take it', async () => {
    const result = await getAvailability(
      businessId,
      { serviceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 },
      prisma,
    );
    const day = result.days.find((d) => d.dayKey === DAY)!;
    expect(day.slots[0]?.employeeIds).toEqual([employeeId]);
  });

  it('is empty for a service the employee does not offer', async () => {
    const result = await getAvailability(
      businessId,
      { serviceId: otherServiceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 },
      prisma,
    );
    expect(startsOn(result)).toEqual([]);
  });

  it('removes slots covered by approved time-off', async () => {
    await prisma.timeOff.create({
      data: {
        businessId,
        employeeId,
        startAt: new Date(`${DAY}T13:00:00.000Z`),
        endAt: new Date(`${DAY}T17:00:00.000Z`),
        approved: true,
      },
    });
    const result = await getAvailability(
      businessId,
      { serviceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 },
      prisma,
    );
    // Afternoon is now off — only the morning slots survive.
    expect(startsOn(result)).toEqual(['09:00', '11:00']);
  });
});
