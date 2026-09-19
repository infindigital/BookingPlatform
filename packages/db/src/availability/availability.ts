import type { BookingStatus, PrismaClient } from '@prisma/client';
import {
  generateSlots,
  subtractManySpans,
  intersectSpans,
  buildBusinessHoursConstraint,
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
  /**
   * When set, availability is gated to this location: the service must be
   * offered here (or offered everywhere) and only staff assigned here (or
   * assigned nowhere) are considered. Absence of any assignment row keeps the
   * backward-compatible "available everywhere" behaviour.
   */
  locationId?: string | null;
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
    select: {
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
      minAdvanceMinutes: true,
      maxAdvanceDays: true,
      slotIntervalMinutes: true,
    },
  });
  const empty: AvailabilityResult = {
    durationMinutes: service?.durationMinutes ?? 0,
    stepMinutes,
    days: days.map((dayKey) => ({ dayKey, slots: [] })),
  };
  if (!service) return empty;

  // Per-service booking rules layer on top of the caller/business defaults:
  //  - the booking step can be overridden per service,
  //  - the effective minimum lead is the stricter of the global policy and the
  //    service's own minimum notice,
  //  - a max-advance horizon caps how far ahead slots may be offered (only when
  //    a concrete "now" is supplied, i.e. customer-facing lookups).
  const effectiveStepMinutes = service.slotIntervalMinutes && service.slotIntervalMinutes > 0
    ? service.slotIntervalMinutes
    : stepMinutes;
  const effectiveMinLeadMs = Math.max(minLeadMs, (service.minAdvanceMinutes ?? 0) * MIN);

  // Location gating (backward-compatible): a service with explicit
  // ServiceLocation rows is only bookable at those locations; a service with no
  // rows is offered everywhere.
  if (params.locationId) {
    const serviceLocationCount = await db.serviceLocation.count({
      where: { businessId, serviceId: params.serviceId },
    });
    if (serviceLocationCount > 0) {
      const offeredHere = await db.serviceLocation.count({
        where: { businessId, serviceId: params.serviceId, locationId: params.locationId },
      });
      if (offeredHere === 0) return empty;
    }
  }

  // Eligible, active employees who offer this service.
  const offering = await db.employeeService.findMany({
    where: { businessId, serviceId: params.serviceId, ...(params.employeeId ? { employeeId: params.employeeId } : {}) },
    select: { employeeId: true },
  });
  let offeringIds = offering.map((o) => o.employeeId);
  if (offeringIds.length === 0) return empty;

  // Narrow to staff who work at this location. An employee with explicit
  // EmployeeLocation rows only counts at those locations; one with no rows works
  // everywhere (backward-compatible default).
  if (params.locationId) {
    const empLocs = await db.employeeLocation.findMany({
      where: { businessId, employeeId: { in: offeringIds } },
      select: { employeeId: true, locationId: true },
    });
    const hasAnyAssignment = new Set<string>();
    const assignedHere = new Set<string>();
    for (const el of empLocs) {
      hasAnyAssignment.add(el.employeeId);
      if (el.locationId === params.locationId) assignedHere.add(el.employeeId);
    }
    offeringIds = offeringIds.filter((id) => !hasAnyAssignment.has(id) || assignedHere.has(id));
    if (offeringIds.length === 0) return empty;
  }
  const activeEmployees = await db.employee.findMany({
    where: { businessId, isActive: true, id: { in: offeringIds } },
    select: { id: true },
  });
  const employeeIds = activeEmployees.map((e) => e.id);
  if (employeeIds.length === 0) return empty;

  const rangeStart = dateMidnightInstant(params.fromDayKey, timeZone);
  const rangeEnd = dateMidnightInstant(addDays(params.toDayKey, 1), timeZone);

  const [workingHours, bookings, timeOff, blocked, holidays, businessHoursRowsForLocation, specialDays] = await Promise.all([
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
    db.businessHours.findMany({
      where: { businessId, locationId: params.locationId ?? null },
      select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
    }),
    db.specialDay.findMany({
      where: {
        businessId,
        ...(params.locationId
          ? { OR: [{ locationId: params.locationId }, { locationId: null }] }
          : { locationId: null }),
      },
      select: { date: true, locationId: true, isClosed: true, openTime: true, closeTime: true },
    }),
  ]);

  // When a location was requested but has no opening hours of its own, fall back
  // to the business-wide rows so per-location config is optional.
  const businessHoursRows =
    params.locationId && businessHoursRowsForLocation.length === 0
      ? await db.businessHours.findMany({
          where: { businessId, locationId: null },
          select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
        })
      : businessHoursRowsForLocation;

  // Business-wide opening hours act as an outer boundary on every employee's
  // bookable windows. When no rows are configured the constraint is inert, so
  // availability is unchanged for businesses that never set opening hours.
  const businessHours = buildBusinessHoursConstraint(businessHoursRows);

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

  // Date-specific overrides. A location-specific special day wins over a
  // business-wide one for the same date. isClosed short-circuits the day; custom
  // open/close hours replace the normal opening-hours boundary for that date.
  interface SpecialForDay {
    isClosed: boolean;
    open: number | null;
    close: number | null;
  }
  const specialByDay = new Map<string, SpecialForDay>();
  const scopedDates = new Set<string>();
  const toSpecial = (sd: (typeof specialDays)[number]): SpecialForDay => ({
    isClosed: sd.isClosed,
    open: sd.openTime ? parseHHMM(sd.openTime) : null,
    close: sd.closeTime ? parseHHMM(sd.closeTime) : null,
  });
  // Location-scoped rows win over business-wide ones for the same date.
  for (const sd of specialDays) {
    if (sd.locationId === null) continue;
    const key = localWallClock(sd.date, timeZone).dayKey;
    specialByDay.set(key, toSpecial(sd));
    scopedDates.add(key);
  }
  for (const sd of specialDays) {
    if (sd.locationId !== null) continue;
    const key = localWallClock(sd.date, timeZone).dayKey;
    if (!scopedDates.has(key)) specialByDay.set(key, toSpecial(sd));
  }

  const durationMs = service.durationMinutes * MIN;
  const stepMs = effectiveStepMinutes * MIN;
  const bufferBeforeMs = service.bufferBeforeMinutes * MIN;
  const bufferAfterMs = service.bufferAfterMinutes * MIN;
  const nowMs = params.now?.getTime();
  // Booking horizon: when a max-advance is set and we have a concrete "now",
  // slots starting after the cutoff are not offered.
  const maxAdvanceMs =
    nowMs !== undefined && service.maxAdvanceDays && service.maxAdvanceDays > 0
      ? nowMs + service.maxAdvanceDays * 24 * 60 * MIN
      : undefined;

  const resultDays: AvailabilityDay[] = [];
  for (const dayKey of days) {
    const special = specialByDay.get(dayKey);
    // A special day with custom open/close hours overrides both holidays and the
    // normal weekday opening hours; a closed special day yields no availability.
    const hasSpecialHours = !!special && !special.isClosed && special.open !== null && special.close !== null && special.close > special.open;

    if (special?.isClosed) {
      resultDays.push({ dayKey, slots: [] });
      continue;
    }
    if (!special && isHoliday(dayKey)) {
      resultDays.push({ dayKey, slots: [] });
      continue;
    }
    const weekday = weekdayOf(dayKey);
    // A business-wide closed weekday yields no availability, unless a special day
    // explicitly opens this date with custom hours.
    if (!hasSpecialHours && businessHours.closedDays.has(weekday)) {
      resultDays.push({ dayKey, slots: [] });
      continue;
    }
    // Business opening windows: the special-day custom hours when set, otherwise
    // this weekday's configured hours (undefined = unconstrained).
    let businessSpans: Span[] | null;
    if (hasSpecialHours) {
      businessSpans = [
        {
          start: wallTimeToInstant(dayKey, special!.open!, timeZone).getTime(),
          end: wallTimeToInstant(dayKey, special!.close!, timeZone).getTime(),
        },
      ];
    } else {
      const bhForDay = businessHours.windowsByDay.get(weekday);
      businessSpans = bhForDay
        ? bhForDay.map((w) => ({
            start: wallTimeToInstant(dayKey, w.open, timeZone).getTime(),
            end: wallTimeToInstant(dayKey, w.close, timeZone).getTime(),
          }))
        : null;
    }
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
      // Clip to the business opening hours when they are configured.
      const bounded = businessSpans ? intersectSpans(windows, businessSpans) : windows;
      if (bounded.length === 0) continue;

      const busy = [...(busyByEmployee.get(empId) ?? []), ...globalBlocks];
      const starts = generateSlots({
        windows: bounded,
        busy,
        durationMs,
        stepMs,
        bufferBeforeMs,
        bufferAfterMs,
        now: nowMs,
        minLeadMs: effectiveMinLeadMs,
      });
      for (const startMs of starts) {
        // Enforce the per-service booking horizon (max advance).
        if (maxAdvanceMs !== undefined && startMs > maxAdvanceMs) continue;
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

  return { durationMinutes: service.durationMinutes, stepMinutes: effectiveStepMinutes, days: resultDays };
}
