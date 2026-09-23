import type { BookingStatus, PrismaClient } from '@prisma/client';
import { weekdayOf, buildBusinessHoursConstraint, addDays } from '@booking/core';
import { prisma } from '../client';
import { localWallClock, dateMidnightInstant } from '../dashboard/timezone';

/**
 * Calendar read model. Tenant-scoped; returns bookings within an absolute
 * instant range plus the wall-clock layout coordinates (local day + minutes
 * from midnight, in the business timezone) so the client renders a pure grid
 * without doing timezone math. Cancelled/rejected bookings are excluded - the
 * calendar shows what actually occupies time.
 */

const VISIBLE_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW'];

export interface CalendarBooking {
  id: string;
  startISO: string;
  endISO: string;
  /** Local calendar day (YYYY-MM-DD) of the start, in the business timezone. */
  dayKey: string;
  /** Minutes from local midnight, clamped to a single day for layout. */
  startMinutes: number;
  endMinutes: number;
  status: BookingStatus;
  customerName: string;
  customerEmail: string | null;
  serviceName: string;
  serviceColor: string | null;
  employeeId: string | null;
  employeeName: string | null;
  locationName: string | null;
  priceTotal: number;
  currency: string;
  source: string | null;
  notes: string | null;
}

export interface CalendarEmployee {
  id: string;
  name: string;
}

export interface CalendarService {
  id: string;
  name: string;
  color: string | null;
}

/** Non-bookable time drawn behind the grid: closures, holidays, time off, blocks. */
export type CalendarOffKind = 'closed' | 'timeoff' | 'blocked';

export interface CalendarOff {
  /** Local calendar day (YYYY-MM-DD) in the business timezone. */
  dayKey: string;
  /** Minutes from local midnight (0..1440). A full day is 0..1440. */
  startMinutes: number;
  endMinutes: number;
  /** True when the whole day is off (closure/holiday/full-day time off). */
  allDay: boolean;
  kind: CalendarOffKind;
  label: string | null;
  /** Employee this applies to, when it is per-person (time off); null = business-wide. */
  employeeId: string | null;
}

export interface CalendarData {
  bookings: CalendarBooking[];
  employees: CalendarEmployee[];
  services: CalendarService[];
  off: CalendarOff[];
}

export interface CalendarQuery {
  start: Date;
  end: Date;
  timeZone: string;
  employeeId?: string | null;
  /** Ordered day keys (YYYY-MM-DD) the view spans, used to lay out closures/off-time. */
  days?: string[];
}

/** Minutes-since-midnight span of an instant interval within one local day (clamped). */
function daySpan(
  interval: { start: Date; end: Date },
  dayKey: string,
  timeZone: string,
): { startMinutes: number; endMinutes: number } | null {
  const dayStart = dateMidnightInstant(dayKey, timeZone).getTime();
  const dayEnd = dateMidnightInstant(addDays(dayKey, 1), timeZone).getTime();
  const s = Math.max(interval.start.getTime(), dayStart);
  const e = Math.min(interval.end.getTime(), dayEnd);
  if (e <= s) return null;
  const startMinutes = s <= dayStart ? 0 : localWallClock(new Date(s), timeZone).minutes;
  const endMinutes = e >= dayEnd ? 1440 : localWallClock(new Date(e), timeZone).minutes;
  return { startMinutes, endMinutes: Math.max(startMinutes + 5, endMinutes) };
}

export async function getCalendarData(
  businessId: string,
  query: CalendarQuery,
  db: PrismaClient = prisma,
): Promise<CalendarData> {
  if (!businessId) throw new Error('getCalendarData requires a businessId.');
  const timeZone = query.timeZone || 'UTC';

  const employeeFilter = query.employeeId ?? null;
  const [rows, employees, services, businessHoursRows, holidays, specialDays, timeOff, blocked] = await Promise.all([
    db.booking.findMany({
      where: {
        businessId,
        status: { in: VISIBLE_STATUSES },
        startAt: { gte: query.start, lt: query.end },
        ...(employeeFilter ? { employeeId: employeeFilter } : {}),
      },
      orderBy: { startAt: 'asc' },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        service: { select: { name: true, color: true } },
        employee: { select: { firstName: true, lastName: true } },
        location: { select: { name: true } },
      },
    }),
    db.employee.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.service.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    db.businessHours.findMany({
      where: { businessId, locationId: null },
      select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
    }),
    db.holiday.findMany({ where: { businessId }, select: { name: true, date: true, recurringYearly: true } }),
    db.specialDay.findMany({
      where: { businessId, locationId: null },
      select: { date: true, name: true, isClosed: true, openTime: true, closeTime: true },
    }),
    db.timeOff.findMany({
      where: {
        businessId,
        approved: true,
        startAt: { lt: query.end },
        endAt: { gt: query.start },
        ...(employeeFilter ? { employeeId: employeeFilter } : {}),
      },
      select: { employeeId: true, startAt: true, endAt: true, reason: true },
    }),
    db.blockedTime.findMany({
      where: {
        businessId,
        startAt: { lt: query.end },
        endAt: { gt: query.start },
        ...(employeeFilter ? { OR: [{ employeeId: employeeFilter }, { employeeId: null }] } : {}),
      },
      select: { employeeId: true, startAt: true, endAt: true, reason: true },
    }),
  ]);

  const bookings: CalendarBooking[] = rows.map((b) => {
    const startPos = localWallClock(b.startAt, timeZone);
    const endPos = localWallClock(b.endAt, timeZone);
    // If the booking ends on a later local day, clamp to end-of-day for layout.
    const endMinutes = endPos.dayKey === startPos.dayKey ? endPos.minutes : 24 * 60;
    return {
      id: b.id,
      startISO: b.startAt.toISOString(),
      endISO: b.endAt.toISOString(),
      dayKey: startPos.dayKey,
      startMinutes: startPos.minutes,
      endMinutes: Math.max(startPos.minutes + 5, endMinutes),
      status: b.status,
      customerName: b.customer ? `${b.customer.firstName} ${b.customer.lastName}`.trim() : 'Unknown',
      customerEmail: b.customer?.email ?? null,
      serviceName: b.service?.name ?? 'Service',
      serviceColor: b.service?.color ?? null,
      employeeId: b.employeeId,
      employeeName: b.employee ? `${b.employee.firstName} ${b.employee.lastName}`.trim() : null,
      locationName: b.location?.name ?? null,
      priceTotal: Number(b.priceTotal.toString()),
      currency: b.currency,
      source: b.source,
      notes: b.notes,
    };
  });

  // ---- Off-time overlays (closures, holidays, time off, blocks) -------------
  const off: CalendarOff[] = [];
  const days = query.days ?? [];

  // Whole-day closures: business-closed weekdays, holidays, and closed special days.
  const constraint = buildBusinessHoursConstraint(businessHoursRows);
  const holidayByDay = new Map<string, string | null>();
  for (const h of holidays) {
    const key = localWallClock(h.date, timeZone).dayKey;
    holidayByDay.set(key, h.name ?? null);
    if (h.recurringYearly) holidayByDay.set(`*-${key.slice(5)}`, h.name ?? null);
  }
  interface SpecialInfo { isClosed: boolean; hasHours: boolean; name: string | null }
  const specialByDay = new Map<string, SpecialInfo>();
  for (const sd of specialDays) {
    const key = localWallClock(sd.date, timeZone).dayKey;
    specialByDay.set(key, {
      isClosed: sd.isClosed,
      hasHours: !sd.isClosed && !!sd.openTime && !!sd.closeTime,
      name: sd.name ?? null,
    });
  }

  for (const dayKey of days) {
    const special = specialByDay.get(dayKey);
    const holidayName = holidayByDay.get(dayKey) ?? holidayByDay.get(`*-${dayKey.slice(5)}`);
    const weekday = weekdayOf(dayKey);
    let closed = false;
    let label: string | null = null;

    if (special?.isClosed) {
      closed = true;
      label = special.name ?? 'Closed';
    } else if (special?.hasHours) {
      closed = false; // custom open hours override a closed weekday/holiday
    } else if (holidayName !== undefined) {
      closed = true;
      label = holidayName ?? 'Holiday';
    } else if (constraint.closedDays.has(weekday) && !constraint.windowsByDay.has(weekday)) {
      closed = true;
      label = 'Closed';
    }

    if (closed) {
      off.push({ dayKey, startMinutes: 0, endMinutes: 1440, allDay: true, kind: 'closed', label, employeeId: null });
    }
  }

  // Time off (per employee) and blocked time - split across each day they touch.
  const empName = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));
  const multiStaff = employees.length > 1;
  const pushInterval = (
    interval: { start: Date; end: Date },
    kind: CalendarOffKind,
    baseLabel: string | null,
    employeeId: string | null,
  ) => {
    for (const dayKey of days) {
      const span = daySpan(interval, dayKey, timeZone);
      if (!span) continue;
      const allDay = span.startMinutes === 0 && span.endMinutes >= 1440;
      const who = employeeId && multiStaff ? empName.get(employeeId) ?? null : null;
      const label = [who, baseLabel].filter(Boolean).join(' - ') || null;
      off.push({ dayKey, startMinutes: span.startMinutes, endMinutes: span.endMinutes, allDay, kind, label, employeeId });
    }
  };
  for (const t of timeOff) pushInterval({ start: t.startAt, end: t.endAt }, 'timeoff', t.reason ?? 'Time off', t.employeeId);
  for (const b of blocked) pushInterval({ start: b.startAt, end: b.endAt }, 'blocked', b.reason ?? 'Blocked', b.employeeId);

  return {
    bookings,
    employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
    services,
    off,
  };
}
