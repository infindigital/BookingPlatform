import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { repositoriesFor } from '../src/repositories/index';
import { getAvailability } from '../src/availability/availability';
import { getEmployeesList } from '../src/employees/list';
import { getEmployeeDetail } from '../src/employees/detail';
import { createBooking } from '../src/booking/create-booking';

const prisma = new PrismaClient();

let businessId = '';
let serviceId = '';
let otherServiceId = '';
let employeeId = '';
let customerId = '';

const DAY = '2031-09-03'; // a Wednesday
const weekday = new Date(Date.UTC(2031, 8, 3)).getUTCDay();

function startTimes(days: { dayKey: string; slots: { startISO: string; employeeIds: string[] }[] }[], dayKey: string): string[] {
  const day = days.find((d) => d.dayKey === dayKey);
  return (day?.slots ?? []).map((s) => s.startISO);
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `emp-${Date.now()}`, name: 'Emp Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Cut', durationMinutes: 60, price: 50 } })).id;
  otherServiceId = (await prisma.service.create({ data: { businessId, name: 'Color', durationMinutes: 30, price: 80 } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'Sam', lastName: 'Doe', email: 'sam@emp.local' } })).id;

  const repos = repositoriesFor(businessId, prisma);
  const emp = await repos.employees.create({ firstName: 'Ivy', lastName: 'Ng', title: 'Stylist' });
  employeeId = emp.id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

async function avail(employee = employeeId, service = serviceId) {
  return getAvailability(
    businessId,
    { serviceId: service, employeeId: employee, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', now: new Date('2031-01-01T00:00:00Z') },
    prisma,
  );
}

describe('EmployeeRepository.setServices drives availability', () => {
  it('an employee with no assignment or hours has no availability', async () => {
    const res = await avail();
    expect(startTimes(res.days, DAY)).toHaveLength(0);
  });

  it('assigning a service + hours produces bookable slots for that employee', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.setServices(employeeId, [{ serviceId }]);
    await repos.employees.replaceWeeklyHours(employeeId, [{ dayOfWeek: weekday, startTime: '09:00', endTime: '17:00', breaks: [] }]);

    const res = await avail();
    const starts = startTimes(res.days, DAY);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts).toContain(`${DAY}T09:00:00.000Z`);
    // every slot is offered by this employee
    const day = res.days.find((d) => d.dayKey === DAY)!;
    expect(day.slots.every((s) => s.employeeIds.includes(employeeId))).toBe(true);
  });

  it('unassigning the service removes availability but leaves hours intact', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.setServices(employeeId, [{ serviceId: otherServiceId }]);
    const res = await avail(); // still asking for `serviceId`, no longer offered
    expect(startTimes(res.days, DAY)).toHaveLength(0);
    // restore
    await repos.employees.setServices(employeeId, [{ serviceId }]);
  });

  it('ignores a service id from another tenant', async () => {
    const other = await prisma.business.create({ data: { slug: `emp-x-${Date.now()}`, name: 'X', timezone: 'UTC', currency: 'USD' } });
    const foreign = await prisma.service.create({ data: { businessId: other.id, name: 'Foreign', durationMinutes: 60, price: 10 } });
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.setServices(employeeId, [{ serviceId }, { serviceId: foreign.id }]);
    const assignments = await prisma.employeeService.findMany({ where: { businessId, employeeId } });
    expect(assignments.map((a) => a.serviceId)).toEqual([serviceId]);
    await prisma.business.deleteMany({ where: { id: other.id } });
  });
});

describe('working hours + breaks + time off carve availability', () => {
  it('a break removes slots that overlap it', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.replaceWeeklyHours(employeeId, [
      { dayOfWeek: weekday, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] },
    ]);
    const starts = startTimes((await avail()).days, DAY);
    expect(starts).toContain(`${DAY}T11:00:00.000Z`); // ends 12:00, fits before break
    expect(starts).not.toContain(`${DAY}T12:00:00.000Z`); // overlaps break
    expect(starts).toContain(`${DAY}T13:00:00.000Z`); // resumes after break
  });

  it('approved time off removes overlapping slots', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.replaceWeeklyHours(employeeId, [{ dayOfWeek: weekday, startTime: '09:00', endTime: '17:00', breaks: [] }]);
    const off = await repos.employees.addTimeOff(employeeId, {
      startAt: new Date(`${DAY}T09:00:00.000Z`),
      endAt: new Date(`${DAY}T12:00:00.000Z`),
    });
    const starts = startTimes((await avail()).days, DAY);
    expect(starts).not.toContain(`${DAY}T09:00:00.000Z`);
    expect(starts).toContain(`${DAY}T13:00:00.000Z`);
    await repos.employees.removeTimeOff(off.id);
    // after removal the morning is bookable again
    expect(startTimes((await avail()).days, DAY)).toContain(`${DAY}T09:00:00.000Z`);
  });
});

describe('read models', () => {
  it('getEmployeeDetail reflects assignments, schedule and stats', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.setServices(employeeId, [{ serviceId, priceOverride: 65 }]);
    await repos.employees.replaceWeeklyHours(employeeId, [{ dayOfWeek: weekday, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] }]);

    const detail = await getEmployeeDetail(businessId, employeeId, prisma);
    expect(detail).not.toBeNull();
    expect(detail!.title).toBe('Stylist');
    // catalog exposes both services; only `serviceId` is assigned with the override
    const cut = detail!.services.find((s) => s.serviceId === serviceId)!;
    const color = detail!.services.find((s) => s.serviceId === otherServiceId)!;
    expect(cut.assigned).toBe(true);
    expect(cut.priceOverride).toBe(65);
    expect(color.assigned).toBe(false);
    // schedule round-trips the break
    const day = detail!.schedule.find((d) => d.dayOfWeek === weekday)!;
    expect(day.startTime).toBe('09:00');
    expect(day.breaks).toEqual([{ startTime: '12:00', endTime: '13:00', label: null }]);
  });

  it('getEmployeesList aggregates services, weekly minutes and upcoming bookings', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.setServices(employeeId, [{ serviceId }]);
    await repos.employees.replaceWeeklyHours(employeeId, [{ dayOfWeek: weekday, startTime: '09:00', endTime: '17:00', breaks: [{ startTime: '12:00', endTime: '13:00' }] }]);
    // a future booking → counts as upcoming
    await createBooking(
      { businessId, customerId, serviceId, employeeId, startAt: new Date(`${DAY}T14:00:00.000Z`), endAt: new Date(`${DAY}T15:00:00.000Z`), status: 'ACCEPTED', priceTotal: 50 },
      prisma,
    );

    const list = await getEmployeesList(businessId, { includeInactive: true }, prisma);
    const row = list.rows.find((r) => r.id === employeeId)!;
    expect(row.servicesCount).toBe(1);
    expect(row.weeklyMinutes).toBe(420); // 8h window minus 1h lunch
    expect(row.upcomingCount).toBeGreaterThanOrEqual(1);
  });

  it('inactive employees are excluded from availability', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.employees.setActive(employeeId, false);
    expect(startTimes((await avail()).days, DAY)).toHaveLength(0);
    await repos.employees.setActive(employeeId, true);
  });
});
