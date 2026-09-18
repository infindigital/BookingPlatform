import type { BookingStatus, PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { repositoriesFor } from '../repositories/index';

/**
 * Admin Customers list (CRM). Tenant-scoped, searchable and paginated, with the
 * per-customer aggregates staff care about: how many bookings, how many are
 * upcoming, when they last visited, and lifetime spend (completed bookings).
 */

export interface CustomerListRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdISO: string;
  bookingsCount: number;
  upcomingCount: number;
  completedCount: number;
  lastVisitISO: string | null;
  totalSpent: number;
  currency: string;
}

export interface CustomersListFilters {
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface CustomersListResult {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'RESCHEDULED'];

export async function getCustomersList(
  businessId: string,
  filters: CustomersListFilters,
  db: PrismaClient = prisma,
): Promise<CustomersListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const search = filters.search?.trim() || undefined;
  const repos = repositoriesFor(businessId, db);

  const [total, customers, business] = await Promise.all([
    repos.customers.count({ search }),
    repos.customers.list({ search, take: pageSize, skip: (page - 1) * pageSize }),
    db.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  const currency = business?.currency ?? 'USD';

  const ids = customers.map((c) => c.id);
  const bookings = ids.length
    ? await db.booking.findMany({
        where: { businessId, customerId: { in: ids } },
        select: { customerId: true, status: true, startAt: true, priceTotal: true },
      })
    : [];

  const now = Date.now();
  type Agg = { count: number; upcoming: number; completed: number; last: number | null; spent: number };
  const agg = new Map<string, Agg>();
  for (const id of ids) agg.set(id, { count: 0, upcoming: 0, completed: 0, last: null, spent: 0 });
  for (const b of bookings) {
    const a = agg.get(b.customerId);
    if (!a) continue;
    a.count += 1;
    const start = b.startAt.getTime();
    if (UPCOMING_STATUSES.includes(b.status) && start >= now) a.upcoming += 1;
    if (b.status === 'COMPLETED') {
      a.completed += 1;
      a.spent += Number(b.priceTotal);
      if (a.last === null || start > a.last) a.last = start;
    }
  }

  const rows: CustomerListRow[] = customers.map((c) => {
    const a = agg.get(c.id)!;
    return {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      phone: c.phone,
      createdISO: c.createdAt.toISOString(),
      bookingsCount: a.count,
      upcomingCount: a.upcoming,
      completedCount: a.completed,
      lastVisitISO: a.last ? new Date(a.last).toISOString() : null,
      totalSpent: a.spent,
      currency,
    };
  });

  return { rows, total, page, pageSize };
}
