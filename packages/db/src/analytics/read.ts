import type { BookingStatus, PrismaClient } from '@prisma/client';
import {
  addDays,
  daySpan,
  chooseGranularity,
  enumerateBuckets,
  bucketKeyOf,
  bucketLabel,
  ratio,
  roundMoney,
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  type AnalyticsGranularity,
} from '@booking/core';
import { prisma } from '../client';
import { dateMidnightInstant, localWallClock } from '../dashboard/timezone';

/**
 * Analytics read model. All aggregation is tenant-scoped and computed on the
 * backend from real bookings + the payment ledger - the UI never queries the DB
 * and no value is fabricated. Bookings are bucketed by their *local* day (in the
 * business timezone) so a series lines up with how the business experiences time.
 */

const REVENUE_STATUSES: BookingStatus[] = ['ACCEPTED', 'COMPLETED'];
const CANCELLED_STATUSES: BookingStatus[] = ['CANCELLED', 'REJECTED'];
const MAX_RANGE_DAYS = 366;

export interface AnalyticsFilters {
  fromDayKey: string;
  toDayKey: string;
  timeZone?: string;
}

export interface AnalyticsSummary {
  bookings: number;
  completed: number;
  noShow: number;
  cancelled: number;
  /** completed ÷ (completed + no-show); 0 when neither has occurred. */
  completionRate: number;
  bookedRevenue: number;
  collectedRevenue: number;
  newCustomers: number;
  uniqueCustomers: number;
  currency: string;
}

export interface AnalyticsSeriesPoint {
  bucket: string;
  label: string;
  bookings: number;
  bookedRevenue: number;
  collectedRevenue: number;
}

export interface AnalyticsStatusCount {
  status: BookingStatus;
  label: string;
  count: number;
}

export interface AnalyticsBreakdownItem {
  key: string;
  label: string;
  count: number;
  revenue: number;
}

export interface AnalyticsResult {
  granularity: AnalyticsGranularity;
  fromDayKey: string;
  toDayKey: string;
  summary: AnalyticsSummary;
  series: AnalyticsSeriesPoint[];
  byStatus: AnalyticsStatusCount[];
  topServices: AnalyticsBreakdownItem[];
  topEmployees: AnalyticsBreakdownItem[];
  bySource: AnalyticsBreakdownItem[];
}

const SOURCE_LABELS: Record<string, string> = {
  widget: 'Online widget',
  admin: 'Admin',
  api: 'API',
  unknown: 'Unknown',
};

function bump(map: Map<string, { label: string; count: number; revenue: number }>, key: string, label: string, revenue: number) {
  const row = map.get(key) ?? { label, count: 0, revenue: 0 };
  row.count += 1;
  row.revenue += revenue;
  map.set(key, row);
}

function topItems(map: Map<string, { label: string; count: number; revenue: number }>, limit: number): AnalyticsBreakdownItem[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count, revenue: roundMoney(v.revenue) }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, limit);
}

export async function getAnalytics(
  businessId: string,
  filters: AnalyticsFilters,
  db: PrismaClient = prisma,
): Promise<AnalyticsResult> {
  if (!businessId) throw new Error('getAnalytics requires a businessId.');
  const timeZone = filters.timeZone || 'UTC';

  // Normalise + clamp the range.
  let fromDayKey = filters.fromDayKey;
  let toDayKey = filters.toDayKey;
  if (fromDayKey > toDayKey) [fromDayKey, toDayKey] = [toDayKey, fromDayKey];
  if (daySpan(fromDayKey, toDayKey) > MAX_RANGE_DAYS) fromDayKey = addDays(toDayKey, -(MAX_RANGE_DAYS - 1));

  const granularity = chooseGranularity(fromDayKey, toDayKey);
  const rangeStart = dateMidnightInstant(fromDayKey, timeZone);
  const rangeEnd = dateMidnightInstant(addDays(toDayKey, 1), timeZone);

  const [bookings, txns, newCustomers, business] = await Promise.all([
    db.booking.findMany({
      where: { businessId, startAt: { gte: rangeStart, lt: rangeEnd } },
      select: {
        startAt: true,
        status: true,
        priceTotal: true,
        serviceId: true,
        employeeId: true,
        customerId: true,
        source: true,
        service: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    db.paymentTransaction.findMany({
      where: { businessId, createdAt: { gte: rangeStart, lt: rangeEnd } },
      select: { type: true, amount: true, createdAt: true },
    }),
    db.customer.count({ where: { businessId, createdAt: { gte: rangeStart, lt: rangeEnd } } }),
    db.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);

  const bucketKeys = enumerateBuckets(fromDayKey, toDayKey, granularity);
  const seriesMap = new Map<string, { bookings: number; bookedRevenue: number; collectedRevenue: number }>();
  for (const k of bucketKeys) seriesMap.set(k, { bookings: 0, bookedRevenue: 0, collectedRevenue: 0 });

  const statusCounts = new Map<BookingStatus, number>();
  const serviceMap = new Map<string, { label: string; count: number; revenue: number }>();
  const employeeMap = new Map<string, { label: string; count: number; revenue: number }>();
  const sourceMap = new Map<string, { label: string; count: number; revenue: number }>();
  const uniqueCustomers = new Set<string>();

  let bookedRevenue = 0;
  let completed = 0;
  let noShow = 0;
  let cancelled = 0;

  for (const b of bookings) {
    const dayKey = localWallClock(b.startAt, timeZone).dayKey;
    const bucket = bucketKeyOf(dayKey, granularity);
    const price = Number(b.priceTotal.toString());
    const isRevenue = REVENUE_STATUSES.includes(b.status);
    const revenue = isRevenue ? price : 0;

    const cell = seriesMap.get(bucket);
    if (cell) {
      cell.bookings += 1;
      cell.bookedRevenue += revenue;
    }

    statusCounts.set(b.status, (statusCounts.get(b.status) ?? 0) + 1);
    if (isRevenue) bookedRevenue += price;
    if (b.status === 'COMPLETED') completed += 1;
    if (b.status === 'NO_SHOW') noShow += 1;
    if (CANCELLED_STATUSES.includes(b.status)) cancelled += 1;
    uniqueCustomers.add(b.customerId);

    bump(serviceMap, b.serviceId, b.service?.name ?? 'Service', revenue);
    bump(
      employeeMap,
      b.employeeId ?? '__unassigned__',
      b.employee ? `${b.employee.firstName} ${b.employee.lastName}`.trim() : 'Unassigned',
      revenue,
    );
    const srcKey = b.source ?? 'unknown';
    bump(sourceMap, srcKey, SOURCE_LABELS[srcKey] ?? srcKey, revenue);
  }

  let collectedRevenue = 0;
  for (const t of txns) {
    const signed = Number(t.amount.toString()) * (t.type === 'REFUND' ? -1 : 1);
    collectedRevenue += signed;
    const dayKey = localWallClock(t.createdAt, timeZone).dayKey;
    const cell = seriesMap.get(bucketKeyOf(dayKey, granularity));
    if (cell) cell.collectedRevenue += signed;
  }

  const series: AnalyticsSeriesPoint[] = bucketKeys.map((k) => {
    const c = seriesMap.get(k)!;
    return {
      bucket: k,
      label: bucketLabel(k, granularity),
      bookings: c.bookings,
      bookedRevenue: roundMoney(c.bookedRevenue),
      collectedRevenue: roundMoney(c.collectedRevenue),
    };
  });

  const byStatus: AnalyticsStatusCount[] = BOOKING_STATUSES.map((s) => ({
    status: s,
    label: BOOKING_STATUS_LABELS[s],
    count: statusCounts.get(s) ?? 0,
  }));

  return {
    granularity,
    fromDayKey,
    toDayKey,
    summary: {
      bookings: bookings.length,
      completed,
      noShow,
      cancelled,
      completionRate: ratio(completed, completed + noShow),
      bookedRevenue: roundMoney(bookedRevenue),
      collectedRevenue: roundMoney(collectedRevenue),
      newCustomers,
      uniqueCustomers: uniqueCustomers.size,
      currency: business?.currency || 'USD',
    },
    series,
    byStatus,
    topServices: topItems(serviceMap, 6),
    topEmployees: topItems(employeeMap, 6),
    bySource: topItems(sourceMap, 6),
  };
}
