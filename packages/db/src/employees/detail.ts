import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Full editor payload for one employee: profile, the whole service catalogue with
 * assignment flags, the weekly working hours (with breaks) the availability engine
 * reads, upcoming time-off and headline booking stats. Tenant-scoped.
 */

export interface EmployeeServiceOption {
  serviceId: string;
  name: string;
  categoryName: string | null;
  basePrice: number;
  currency: string;
  durationMinutes: number;
  color: string | null;
  assigned: boolean;
  priceOverride: number | null;
}

export interface EmployeeScheduleBreak {
  startTime: string;
  endTime: string;
  label: string | null;
}

export interface EmployeeScheduleDay {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breaks: EmployeeScheduleBreak[];
}

export interface EmployeeTimeOffRow {
  id: string;
  startISO: string;
  endISO: string;
  reason: string | null;
  approved: boolean;
}

export interface EmployeeStats {
  upcomingCount: number;
  completedCount: number;
  totalBookings: number;
}

export interface EmployeeDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isActive: boolean;
  hasLogin: boolean;
  loginName: string | null;
  loginEmail: string | null;
  createdISO: string;
  stats: EmployeeStats;
  services: EmployeeServiceOption[];
  schedule: EmployeeScheduleDay[];
  timeOff: EmployeeTimeOffRow[];
}

export async function getEmployeeDetail(
  businessId: string,
  employeeId: string,
  db: PrismaClient = prisma,
): Promise<EmployeeDetail | null> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId, businessId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!employee) return null;

  const [business, services, assignments, workingHours, timeOff, counts] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
    db.service.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, price: true, durationMinutes: true, color: true, category: { select: { name: true } } },
    }),
    db.employeeService.findMany({ where: { businessId, employeeId }, select: { serviceId: true, priceOverride: true } }),
    db.employeeWorkingHours.findMany({
      where: { businessId, employeeId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      select: { dayOfWeek: true, startTime: true, endTime: true, breaks: { orderBy: { startTime: 'asc' }, select: { startTime: true, endTime: true, label: true } } },
    }),
    db.timeOff.findMany({ where: { businessId, employeeId }, orderBy: { startAt: 'asc' } }),
    db.booking.groupBy({ by: ['status'], where: { businessId, employeeId }, _count: { _all: true } }),
  ]);
  const currency = business?.currency ?? 'USD';

  const assignedBy = new Map(assignments.map((a) => [a.serviceId, a.priceOverride] as const));
  const serviceOptions: EmployeeServiceOption[] = services.map((s) => {
    const override = assignedBy.has(s.id) ? assignedBy.get(s.id) : undefined;
    return {
      serviceId: s.id,
      name: s.name,
      categoryName: s.category?.name ?? null,
      basePrice: Number(s.price),
      currency,
      durationMinutes: s.durationMinutes,
      color: s.color,
      assigned: assignedBy.has(s.id),
      priceOverride: override === undefined || override === null ? null : Number(override),
    };
  });

  const now = Date.now();
  const stats: EmployeeStats = { upcomingCount: 0, completedCount: 0, totalBookings: 0 };
  for (const c of counts) {
    stats.totalBookings += c._count._all;
    if (c.status === 'COMPLETED') stats.completedCount += c._count._all;
  }
  const upcoming = await db.booking.count({
    where: { businessId, employeeId, status: { in: ['PENDING', 'ACCEPTED', 'RESCHEDULED'] }, startAt: { gte: new Date(now) } },
  });
  stats.upcomingCount = upcoming;

  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    email: employee.email,
    phone: employee.phone,
    title: employee.title,
    isActive: employee.isActive,
    hasLogin: employee.userId !== null,
    loginName: employee.user?.name ?? null,
    loginEmail: employee.user?.email ?? null,
    createdISO: employee.createdAt.toISOString(),
    stats,
    services: serviceOptions,
    schedule: workingHours.map((w) => ({
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      breaks: w.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime, label: b.label })),
    })),
    timeOff: timeOff.map((t) => ({
      id: t.id,
      startISO: t.startAt.toISOString(),
      endISO: t.endAt.toISOString(),
      reason: t.reason,
      approved: t.approved,
    })),
  };
}
