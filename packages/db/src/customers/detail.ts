import type { BookingStatus, PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Full CRM profile for a single customer: contact details, lifetime stats, split
 * upcoming/past booking history, and staff notes (with author names). Tenant-scoped.
 */

export interface CustomerBookingRow {
  id: string;
  startISO: string;
  endISO: string;
  status: BookingStatus;
  serviceName: string;
  serviceColor: string | null;
  employeeName: string | null;
  priceTotal: number;
  currency: string;
}

export interface CustomerNoteRow {
  id: string;
  body: string;
  createdISO: string;
  authorName: string | null;
}

export interface CustomerStats {
  bookingsCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  upcomingCount: number;
  totalSpent: number;
  currency: string;
  firstVisitISO: string | null;
  lastVisitISO: string | null;
}

export interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  createdISO: string;
  stats: CustomerStats;
  upcoming: CustomerBookingRow[];
  past: CustomerBookingRow[];
  notes: CustomerNoteRow[];
}

const UPCOMING_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'RESCHEDULED'];

export async function getCustomerDetail(
  businessId: string,
  customerId: string,
  db: PrismaClient = prisma,
): Promise<CustomerDetail | null> {
  const customer = await db.customer.findFirst({ where: { id: customerId, businessId } });
  if (!customer) return null;

  const [business, bookings, notes] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
    db.booking.findMany({
      where: { businessId, customerId },
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        priceTotal: true,
        currency: true,
        service: { select: { name: true, color: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    db.customerNote.findMany({ where: { businessId, customerId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const currency = business?.currency ?? 'USD';

  const authorIds = [...new Set(notes.map((n) => n.authorUserId).filter((v): v is string => !!v))];
  const authors = authorIds.length
    ? await db.user.findMany({ where: { businessId, id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const authorName = new Map(authors.map((a) => [a.id, a.name] as const));

  const now = Date.now();
  const rowOf = (b: (typeof bookings)[number]): CustomerBookingRow => ({
    id: b.id,
    startISO: b.startAt.toISOString(),
    endISO: b.endAt.toISOString(),
    status: b.status,
    serviceName: b.service.name,
    serviceColor: b.service.color,
    employeeName: b.employee ? `${b.employee.firstName} ${b.employee.lastName}`.trim() : null,
    priceTotal: Number(b.priceTotal),
    currency: b.currency,
  });

  const upcoming: CustomerBookingRow[] = [];
  const past: CustomerBookingRow[] = [];
  const stats: CustomerStats = {
    bookingsCount: bookings.length,
    completedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    upcomingCount: 0,
    totalSpent: 0,
    currency,
    firstVisitISO: null,
    lastVisitISO: null,
  };

  for (const b of bookings) {
    const start = b.startAt.getTime();
    const isUpcoming = UPCOMING_STATUSES.includes(b.status) && start >= now;
    if (isUpcoming) {
      stats.upcomingCount += 1;
      upcoming.push(rowOf(b));
    } else {
      past.push(rowOf(b));
    }
    if (b.status === 'COMPLETED') {
      stats.completedCount += 1;
      stats.totalSpent += Number(b.priceTotal);
      if (!stats.lastVisitISO || start > new Date(stats.lastVisitISO).getTime()) stats.lastVisitISO = b.startAt.toISOString();
      if (!stats.firstVisitISO || start < new Date(stats.firstVisitISO).getTime()) stats.firstVisitISO = b.startAt.toISOString();
    }
    if (b.status === 'CANCELLED') stats.cancelledCount += 1;
    if (b.status === 'NO_SHOW') stats.noShowCount += 1;
  }
  // Upcoming came from a desc query; present it soonest-first.
  upcoming.reverse();

  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    name: `${customer.firstName} ${customer.lastName}`.trim(),
    email: customer.email,
    phone: customer.phone,
    createdISO: customer.createdAt.toISOString(),
    stats,
    upcoming,
    past,
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdISO: n.createdAt.toISOString(),
      authorName: n.authorUserId ? authorName.get(n.authorUserId) ?? null : null,
    })),
  };
}
