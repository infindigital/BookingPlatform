import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ValidationError, resolveWeeklyHours } from '@booking/core';
import { SettingsRepository } from '../src/settings/settings.repository';
import { createBooking } from '../src/booking/create-booking';
import { getAvailability } from '../src/availability/availability';

const prisma = new PrismaClient();

let businessId = '';
let serviceId = '';
let employeeId = '';
let customerId = '';

async function resetBusiness(timezone = 'UTC') {
  await prisma.business.update({ where: { id: businessId }, data: { timezone, name: 'Set Co', currency: 'USD', email: null, phone: null } });
  await prisma.location.deleteMany({ where: { businessId } });
  await prisma.businessHours.deleteMany({ where: { businessId } });
  await prisma.holiday.deleteMany({ where: { businessId } });
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `set-${Date.now()}`, name: 'Set Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Svc', durationMinutes: 60 } })).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'E', lastName: '1' } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'C', lastName: '1', email: 'c@set.local' } })).id;
  await prisma.employeeService.create({ data: { businessId, employeeId, serviceId } });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetBusiness('UTC');
});

describe('business profile', () => {
  it('updates and normalises the profile', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    const p = await repo.updateBusinessProfile({ name: '  Aurora  ', timezone: 'America/New_York', currency: 'eur', email: 'x@aurora.test' });
    expect(p).toMatchObject({ name: 'Aurora', timezone: 'America/New_York', currency: 'EUR', email: 'x@aurora.test' });
    const biz = await repo.getBusiness();
    expect(biz).toMatchObject({ name: 'Aurora', timezone: 'America/New_York', currency: 'EUR' });
  });

  it('rejects an invalid profile', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    await expect(repo.updateBusinessProfile({ name: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.updateBusinessProfile({ name: 'X', timezone: 'Mars/Phobos' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('locations', () => {
  it('creates, lists, updates and deactivates', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    const a = await repo.createLocation({ name: 'Downtown', address: '1 Main', timezone: 'America/Chicago' });
    await repo.createLocation({ name: 'Uptown' });
    let list = await repo.listLocations();
    expect(list).toHaveLength(2);
    expect(list.map((l) => l.name)).toContain('Downtown');
    expect(list.find((l) => l.id === a.id)?.timezone).toBe('America/Chicago');

    await repo.updateLocation(a.id, { name: 'Downtown HQ', timezone: '' });
    await repo.setLocationActive(a.id, false);
    list = await repo.listLocations();
    const updated = list.find((l) => l.id === a.id)!;
    expect(updated.name).toBe('Downtown HQ');
    expect(updated.timezone).toBeNull();
    expect(updated.isActive).toBe(false);
  });

  it('deletes an unused location but blocks one with bookings', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    const loc = await repo.createLocation({ name: 'Temp' });
    const del = await repo.deleteLocation(loc.id);
    expect(del.ok).toBe(true);
    expect(await prisma.location.count({ where: { businessId, id: loc.id } })).toBe(0);

    const used = await repo.createLocation({ name: 'Busy' });
    await createBooking(
      { businessId, customerId, serviceId, employeeId, locationId: used.id, startAt: new Date('2031-05-01T10:00:00Z'), endAt: new Date('2031-05-01T11:00:00Z'), status: 'ACCEPTED' },
      prisma,
    );
    await expect(repo.deleteLocation(used.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.location.count({ where: { businessId, id: used.id } })).toBe(1);
  });

  it('is tenant-scoped: cannot touch another business location', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    const loc = await repo.createLocation({ name: 'Mine' });
    const other = new SettingsRepository('non-existent-biz', prisma);
    const res = await other.updateLocation(loc.id, { name: 'Hacked' });
    expect(res.count).toBe(0);
    expect((await repo.listLocations()).find((l) => l.id === loc.id)?.name).toBe('Mine');
  });
});

describe('business hours', () => {
  it('replaces the week and reloads only storable rows', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    const week = resolveWeeklyHours([
      { dayOfWeek: 1, openTime: '08:00', closeTime: '16:00', isClosed: false },
      { dayOfWeek: 0, isClosed: true },
    ]);
    await repo.replaceBusinessHours(week);
    const rows = await repo.getBusinessHours();
    const mon = rows.find((r) => r.dayOfWeek === 1)!;
    expect(mon.openTime).toBe('08:00');
    expect(mon.isClosed).toBe(false);
    expect(rows.find((r) => r.dayOfWeek === 0)?.isClosed).toBe(true);

    // Replacing again fully overwrites the previous set.
    await repo.replaceBusinessHours(resolveWeeklyHours([{ dayOfWeek: 2, openTime: '10:00', closeTime: '14:00', isClosed: false }]));
    const rows2 = await repo.getBusinessHours();
    expect(rows2.find((r) => r.dayOfWeek === 2 && !r.isClosed)).toBeTruthy();
    expect(rows2.find((r) => r.dayOfWeek === 1 && !r.isClosed)).toBeFalsy();
  });
});

describe('holidays', () => {
  it('stores a holiday on the correct local day even in a behind-UTC zone', async () => {
    await prisma.business.update({ where: { id: businessId }, data: { timezone: 'America/New_York' } });
    const repo = new SettingsRepository(businessId, prisma);
    await repo.createHoliday({ name: 'Christmas', dayKey: '2031-12-25', recurringYearly: true });
    const list = await repo.listHolidays();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Christmas', dayKey: '2031-12-25', recurringYearly: true });
  });

  it('validates the date and name, updates and deletes', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    await expect(repo.createHoliday({ name: 'X', dayKey: '2031-13-40' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.createHoliday({ name: '', dayKey: '2031-01-01' })).rejects.toBeInstanceOf(ValidationError);

    const h = await repo.createHoliday({ name: 'Day', dayKey: '2031-07-04' });
    await repo.updateHoliday(h.id, { name: 'Independence Day', dayKey: '2031-07-04', recurringYearly: true });
    let list = await repo.listHolidays();
    expect(list[0]).toMatchObject({ name: 'Independence Day', recurringYearly: true });

    await repo.deleteHoliday(h.id);
    list = await repo.listHolidays();
    expect(list).toHaveLength(0);
  });
});

describe('business hours constrain availability', () => {
  const DAY = '2031-03-05'; // a Wednesday
  const weekday = new Date(Date.UTC(2031, 2, 5)).getUTCDay();

  function startsOn(result: { days: { dayKey: string; slots: { startISO: string }[] }[] }): string[] {
    const day = result.days.find((d) => d.dayKey === DAY);
    return (day?.slots ?? []).map((s) => s.startISO.slice(11, 16));
  }

  beforeEach(async () => {
    await prisma.employeeWorkingHours.deleteMany({ where: { businessId } });
    await prisma.employeeWorkingHours.create({ data: { businessId, employeeId, dayOfWeek: weekday, startTime: '09:00', endTime: '17:00' } });
  });

  it('clips employee windows to the business opening hours', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    // Business open only 10:00–13:00 that weekday.
    await repo.replaceBusinessHours(resolveWeeklyHours([{ dayOfWeek: weekday, openTime: '10:00', closeTime: '13:00', isClosed: false }]));
    const result = await getAvailability(businessId, { serviceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 }, prisma);
    expect(startsOn(result)).toEqual(['10:00', '11:00', '12:00']);
  });

  it('yields no availability on a business-closed weekday', async () => {
    const repo = new SettingsRepository(businessId, prisma);
    await repo.replaceBusinessHours(resolveWeeklyHours([{ dayOfWeek: weekday, isClosed: true }]));
    const result = await getAvailability(businessId, { serviceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 }, prisma);
    expect(startsOn(result)).toEqual([]);
  });

  it('leaves availability unchanged when no business hours are configured', async () => {
    const result = await getAvailability(businessId, { serviceId, fromDayKey: DAY, toDayKey: DAY, timeZone: 'UTC', stepMinutes: 60 }, prisma);
    // Full 09:00–16:00 last start for a 60-min service.
    expect(startsOn(result)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });
});
