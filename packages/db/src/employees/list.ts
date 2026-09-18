import type { BookingStatus, PrismaClient } from '@prisma/client';
import { weeklyWorkingMinutes, type WorkingWindow } from '@booking/core';
import { prisma } from '../client';
import { repositoriesFor } from '../repositories/index';

/**
 * Admin Employees list (staff panel). Tenant-scoped, searchable and paginated,
 * with the per-employee facts a manager scans for: title, whether they have a
 * login, how many services they offer, their weekly hours and upcoming bookings.
 */

export interface EmployeeListRow {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  hasLogin: boolean;
  servicesCount: number;
  weeklyMinutes: number;
  upcomingCount: number;
}

export interface EmployeesListFilters {
  search?: string | null;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface EmployeesListResult {
  rows: EmployeeListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'RESCHEDULED'];

export async function getEmployeesList(
  businessId: string,
  filters: EmployeesListFilters,
  db: PrismaClient = prisma,
): Promise<EmployeesListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const search = filters.search?.trim() || undefined;
  const includeInactive = filters.includeInactive ?? true;
  const repos = repositoriesFor(businessId, db);

  const [total, employees] = await Promise.all([
    repos.employees.count({ search, includeInactive }),
    repos.employees.list({ search, includeInactive, take: pageSize, skip: (page - 1) * pageSize }),
  ]);

  const ids = employees.map((e) => e.id);
  const [serviceCounts, workingHours, upcoming] = ids.length
    ? await Promise.all([
        db.employeeService.groupBy({ by: ['employeeId'], where: { businessId, employeeId: { in: ids } }, _count: { _all: true } }),
        db.employeeWorkingHours.findMany({
          where: { businessId, employeeId: { in: ids } },
          select: { employeeId: true, dayOfWeek: true, startTime: true, endTime: true, breaks: { select: { startTime: true, endTime: true } } },
        }),
        db.booking.groupBy({
          by: ['employeeId'],
          where: { businessId, employeeId: { in: ids }, status: { in: UPCOMING_STATUSES }, startAt: { gte: new Date() } },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];

  const serviceCountBy = new Map<string, number>();
  for (const g of serviceCounts) serviceCountBy.set(g.employeeId, g._count._all);

  const upcomingBy = new Map<string, number>();
  for (const g of upcoming) if (g.employeeId) upcomingBy.set(g.employeeId, g._count._all);

  const windowsBy = new Map<string, WorkingWindow[]>();
  for (const w of workingHours) {
    const arr = windowsBy.get(w.employeeId) ?? [];
    arr.push({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime, breaks: w.breaks });
    windowsBy.set(w.employeeId, arr);
  }

  const rows: EmployeeListRow[] = employees.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`.trim(),
    title: e.title,
    email: e.email,
    phone: e.phone,
    isActive: e.isActive,
    hasLogin: e.userId !== null,
    servicesCount: serviceCountBy.get(e.id) ?? 0,
    weeklyMinutes: weeklyWorkingMinutes(windowsBy.get(e.id) ?? []),
    upcomingCount: upcomingBy.get(e.id) ?? 0,
  }));

  return { rows, total, page, pageSize };
}
