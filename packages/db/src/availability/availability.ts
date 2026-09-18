import type { BookingStatus, PrismaClient } from '@prisma/client';
import {
  generateSlots,
  subtractManySpans,
  weekdayOf,
  addDays,
  SLOT_OCCUPYING_STATUSES,
  type Span,
} from '@booking/core';
import { prisma } from '../client';
import { dateMidnightInstant, wallTimeToInstant, localWallClock } from '../dashboard/timezone';

/**
 * Availability engine (data layer). Resolves each eligible employee's real
 * working hours (minus breaks), then removes existing bookings, approved
 * time-off, blocked times and holidays, and asks the pure core engine
 * (`generateSlots`) for the bookable start times for a given service. Tenant-scoped.
 */

export interface AvailabilitySlot {
  startISO: string;
  endISO: string;
  /** Employees free to take this slot (for assignment when "any" was requested). */
  employeeIds: string[];
}
export interface AvailabilityDay {
  dayKey: string;
  slots: AvailabilitySlot[];
}
export interface AvailabilityResult {
  durationMinutes: number;
  stepMinutes: number;
  days: AvailabilityDay[];
}

export interface AvailabilityParams {
  serviceId: string;
  employeeId?: string | null;
  fromDayKey: string;
  toDayKey: string;
  timeZone: string;
  now?: Date;
  stepMinutes?: number;
  minLeadMinutes?: number;
}

const MIN = 60_000;

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Inclusive list of day keys from → to. */
function dayKeysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  let d = from;
  for (let i = 0; i < 366 && d <= to; i++) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

export async function getAvailability(
  businessId: string,
  params: AvailabilityParams,
  db: PrismaClient = prisma,
): Promise<AvailabilityResult> {
  if (!businessId) throw new Error('getAvailability requires a businessId.');
  const timeZone = params.timeZone || 'UTC';
  const stepMinutes = params.stepMinutes ?? 15;
  const minLeadMs = (params.minLeadMinutes ?? 0) * MIN;
  const days = dayKeysInRange(params.fromDayKey, params.toDayKey);

  const service = await db.service.findFirst({
    where: { id: params.serviceId, businessId },
    select: { durationMinutes: true, bufferBeforeMinutes: true, bufferAfterMinutes: true },
  });
  const empty: AvailabilityResult = {
    durationMinutes: service?.durationMinutes ?? 0,
    stepMinutes,
    days: days.map((dayKey) => ({ dayKey, slots: [] })),
  };
  if (!service) return empty;

  // Eligible, active employees who offer this service.
  const offering = await db.employeeService.findMany({
    where: { businessId, serviceId: params.serviceId, ...(params.employeeId ? { employeeId: params.employeeId } : {}) },
    select: { employeeId: true },
  });
  const offeringIds = offering.map((o) => o.employeeId);
  if (offeringIds.length === 0) return empty;
  const activeEmployees = await db.employee.findMany({
    where: { businessId, isActive: true, id: { in: offeringIds } },
    select: { id: true },
  });
  const employeeIds = activeEmployees.map((e) => e.id);
  if (employeeIds.length === 0) return empty;

  const rangeStart = dateMidnightInstant(params.fromDayKey, timeZone);
  const rangeEnd = dateMidnightInstant(addDays(params.toDayKey, 1), timeZone);

  const [workingHours, bookings, timeOff, blocked, holidays] = await Promise.all([
    db.employeeWorkingHours.findMany({
      where: { businessId, employeeId: { in: employeeIds } },
      select: { employeeId: true, dayOfWeek: true, startTime: true, endTime: true, breaks: { select: { startTime: true, endTime: true } } },
    }),
    db.booking.findMany({
      where: {
        businessId,
        employeeId: { in: employeeIds },
        status: { in: SLOT_OCCUPYING_STATUSES as BookingStatus[] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { employeeId: true, startAt: true, endAt: true },
    }),
    db.timeOff.findMany({
      where: { businessId, employeeId: { in: employeeIds }, approved: true, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { employeeId: true, startAt: true, endAt: true },
    }),
    db.blockedTime.findMany({
      where: { businessId, OR: [{ employeeId: { in: employeeIds } }, { employeeId: null }], startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { employeeId: true, startAt: true, endAt: true },
    }),
    db.holiday.findMany({ where: { businessId }, select: { date: true, recurringYearly: true } }),
  ]);

  // Per-employee busy spans (bookings + own time-off + own/global blocks).
  const busyByEmployee = new Map<string, Span[]>();
  const pushBusy = (empId: string, start: Date, end: Date) => {
    const arr = busyByEmployee.get(empId) ?? [];
    arr.push({ start: start.getTime(), end: end.getTime() });
    busyByEmployee.set(empId, arr);
  };
  for (const b of bookings) if (b.employeeId) pushBusy(b.employeeId, b.startAt, b.endAt);
  for (const t of timeOff) pushBusy(t.employeeId, t.startAt, t.endAt);
  const globalBlocks: Span[] = [];
  for (const bl of blocked) {
    if (bl.employeeId) pushBusy(bl.employeeId, bl.startAt, bl.endAt);
    else globalBlocks.push({ start: bl.startAt.getTime(), end: bl.endAt.getTime() });
  }

  // Holiday day-keys (exact date + recurring month-day), in the business timezone.
  const holidayExact = new Set<string>();
  const holidayMonthDay = new Set<string>();
  for (const h of holidays) {
    const key = localWallClock(h.date, timeZone).dayKey;
    holidayExact.add(key);
    if (h.recurringYearly) holidayMonthDay.add(key.slice(5)); // MM-DD
  }
  const isHoliday = (dayKey: string) => holidayExact.has(dayKey) || holidayMonthDay.has(dayKey.slice(5));

  const durationMs = service.durationMinutes * MIN;
  const stepMs = stepMinutes * MIN;
  const bufferBeforeMs = service.bufferBeforeMinutes * MIN;
  const bufferAfterMs = service.bufferAfterMinutes * MIN;
  const nowMs = params.now?.getTime();

  const resultDays: AvailabilityDay[] = [];
  for (const dayKey of days) {
    if (isHoliday(dayKey)) {
      resultDays.push({ dayKey, slots: [] });
      continue;
    }
    const weekday = weekdayOf(dayKey);
    const startsByEmployee = new Map<number, string[]>(); // startMs → employeeIds

    for (const empId of employeeIds) {
      const rows = workingHours.filter((w) => w.employeeId === empId && w.dayOfWeek === weekday);
      if (rows.length === 0) continue;

      const windows: Span[] = [];
      for (const row of rows) {
        const s = parseHHMM(row.startTime);
        const e = parseHHMM(row.endTime);
        if (s === null || e === null || e <= s) continue;
        const base: Span = {
          start: wallTimeToInstant(dayKey, s, timeZone).getTime(),
          end: wallTimeToInstant(dayKey, e, timeZone).getTime(),
        };
        const holes: Span[] = [];
        for (const br of row.breaks) {
          const bs = parseHHMM(br.startTime);
          const be = parseHHMM(br.endTime);
          if (bs === null || be === null || be <= bs) continue;
          holes.push({
            start: wallTimeToInstant(dayKey, bs, timeZone).getTime(),
            end: wallTimeToInstant(dayKey, be, timeZone).getTime(),
          });
        }
        windows.push(...subtractManySpans([base], holes));
      }
      if (windows.length === 0) continue;

      const busy = [...(busyByEmployee.get(empId) ?? []), ...globalBlocks];
      const starts = generateSlots({
        windows,
        busy,
        durationMs,
        stepMs,
        bufferBeforeMs,
        bufferAfterMs,
        now: nowMs,
        minLeadMs,
      });
      for (const startMs of starts) {
        const arr = startsByEmployee.get(startMs) ?? [];
        arr.push(empId);
        startsByEmployee.set(startMs, arr);
      }
    }

    const slots: AvailabilitySlot[] = [...startsByEmployee.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([startMs, ids]) => ({
        startISO: new Date(startMs).toISOString(),
        endISO: new Date(startMs + durationMs).toISOString(),
        employeeIds: ids,
      }));
    resultDays.push({ dayKey, slots });
  }

  return { durationMinutes: service.durationMinutes, stepMinutes, days: resultDays };
}
