import type { BookingStatus, PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { localWallClock } from '../dashboard/timezone';

/**
 * Calendar read model. Tenant-scoped; returns bookings within an absolute
 * instant range plus the wall-clock layout coordinates (local day + minutes
 * from midnight, in the business timezone) so the client renders a pure grid
 * without doing timezone math. Cancelled/rejected bookings are excluded — the
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

export interface CalendarData {
  bookings: CalendarBooking[];
  employees: CalendarEmployee[];
  services: CalendarService[];
}

export interface CalendarQuery {
  start: Date;
  end: Date;
  timeZone: string;
  employeeId?: string | null;
}

export async function getCalendarData(
  businessId: string,
  query: CalendarQuery,
  db: PrismaClient = prisma,
): Promise<CalendarData> {
  if (!businessId) throw new Error('getCalendarData requires a businessId.');
  const timeZone = query.timeZone || 'UTC';

  const [rows, employees, services] = await Promise.all([
    db.booking.findMany({
      where: {
        businessId,
        status: { in: VISIBLE_STATUSES },
        startAt: { gte: query.start, lt: query.end },
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
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

  return {
    bookings,
    employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
    services,
  };
}
