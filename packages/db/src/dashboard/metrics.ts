import type { BookingStatus, PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { localDayRange, localMonthRange, localWeekday, minutesBetween } from './timezone';

/**
 * Dashboard read model. All aggregation lives in the data layer and is scoped to
 * a single `businessId` (tenant isolation) - the UI never issues its own queries.
 * Everything is derived from real seeded/created data; no values are fabricated.
 */

/** Statuses that count as "on the books" (exclude rejected/cancelled). */
const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW'];
/** Statuses that represent realised/expected revenue. */
const REVENUE_STATUSES: BookingStatus[] = ['ACCEPTED', 'COMPLETED'];

export interface DashboardBooking {
  id: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  source: string | null;
  priceTotal: number;
  currency: string;
  createdAt: Date;
  customerName: string;
  serviceName: string;
  serviceColor: string | null;
  employeeName: string | null;
}

export interface DashboardKpis {
  todayCount: number;
  pendingCount: number;
  upcomingConfirmedCount: number;
  revenueMonth: number;
  /** Ratio 0..1, or null when there is no scheduled capacity today (e.g. closed). */
  utilization: number | null;
  bookedMinutesToday: number;
  capacityMinutesToday: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  today: DashboardBooking[];
  pending: DashboardBooking[];
  recent: DashboardBooking[];
  range: { dayStart: Date; dayEnd: Date; monthStart: Date; monthEnd: Date };
}

type BookingRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  source: string | null;
  priceTotal: { toString(): string };
  currency: string;
  createdAt: Date;
  customer: { firstName: string; lastName: string } | null;
  service: { name: string; color: string | null } | null;
  employee: { firstName: string; lastName: string } | null;
};

const INCLUDE = {
  customer: { select: { firstName: true, lastName: true } },
  service: { select: { name: true, color: true } },
  employee: { select: { firstName: true, lastName: true } },
} as const;

function toDashboardBooking(b: BookingRow): DashboardBooking {
  return {
    id: b.id,
    startAt: b.startAt,
    endAt: b.endAt,
    status: b.status,
    source: b.source,
    priceTotal: Number(b.priceTotal.toString()),
    currency: b.currency,
    createdAt: b.createdAt,
    customerName: b.customer ? `${b.customer.firstName} ${b.customer.lastName}`.trim() : 'Unknown',
    serviceName: b.service?.name ?? 'Service',
    serviceColor: b.service?.color ?? null,
    employeeName: b.employee ? `${b.employee.firstName} ${b.employee.lastName}`.trim() : null,
  };
}

export interface DashboardQuery {
  now?: Date;
  timeZone?: string;
}

export async function getDashboardMetrics(
  businessId: string,
  query: DashboardQuery = {},
  db: PrismaClient = prisma,
): Promise<DashboardData> {
  if (!businessId) throw new Error('getDashboardMetrics requires a businessId.');

  const now = query.now ?? new Date();
  const timeZone = query.timeZone || 'UTC';

  const { start: dayStart, end: dayEnd } = localDayRange(now, timeZone);
  const { start: monthStart, end: monthEnd } = localMonthRange(now, timeZone);
  const weekday = localWeekday(now, timeZone);

  const [
    todayCount,
    pendingCount,
    upcomingConfirmedCount,
    revenueAgg,
    todayRows,
    pendingRows,
    recentRows,
    activeEmployees,
    businessHoursToday,
    todayActiveBookings,
  ] = await Promise.all([
    db.booking.count({
      where: { businessId, startAt: { gte: dayStart, lt: dayEnd }, status: { in: ACTIVE_STATUSES } },
    }),
    db.booking.count({ where: { businessId, status: 'PENDING' } }),
    db.booking.count({ where: { businessId, status: 'ACCEPTED', startAt: { gte: now } } }),
    db.booking.aggregate({
      _sum: { priceTotal: true },
      where: { businessId, status: { in: REVENUE_STATUSES }, startAt: { gte: monthStart, lt: monthEnd } },
    }),
    db.booking.findMany({
      where: { businessId, startAt: { gte: dayStart, lt: dayEnd }, status: { in: ACTIVE_STATUSES } },
      orderBy: { startAt: 'asc' },
      take: 25,
      include: INCLUDE,
    }),
    db.booking.findMany({
      where: { businessId, status: 'PENDING' },
      orderBy: { startAt: 'asc' },
      take: 8,
      include: INCLUDE,
    }),
    db.booking.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: INCLUDE,
    }),
    db.employee.count({ where: { businessId, isActive: true } }),
    db.businessHours.findMany({ where: { businessId, dayOfWeek: weekday }, select: { openTime: true, closeTime: true } }),
    db.booking.findMany({
      where: { businessId, startAt: { gte: dayStart, lt: dayEnd }, status: { in: ACTIVE_STATUSES } },
      select: { startAt: true, endAt: true },
    }),
  ]);

  // Utilization (heuristic, refined with the availability engine in Phase 8):
  // booked minutes today ÷ (open minutes today × active employees).
  const openMinutesToday = businessHoursToday.reduce(
    (sum, h) => sum + minutesBetween(h.openTime, h.closeTime),
    0,
  );
  const capacityMinutesToday = openMinutesToday * activeEmployees;
  const bookedMinutesToday = todayActiveBookings.reduce(
    (sum, b) => sum + Math.max(0, Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60000)),
    0,
  );
  const utilization =
    capacityMinutesToday > 0 ? Math.min(1, bookedMinutesToday / capacityMinutesToday) : null;

  return {
    kpis: {
      todayCount,
      pendingCount,
      upcomingConfirmedCount,
      revenueMonth: Number(revenueAgg._sum.priceTotal?.toString() ?? '0'),
      utilization,
      bookedMinutesToday,
      capacityMinutesToday,
    },
    today: todayRows.map(toDashboardBooking),
    pending: pendingRows.map(toDashboardBooking),
    recent: recentRows.map(toDashboardBooking),
    range: { dayStart, dayEnd, monthStart, monthEnd },
  };
}
