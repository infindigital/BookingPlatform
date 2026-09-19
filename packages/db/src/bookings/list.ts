import type { BookingStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../client';

export interface BookingListRow {
  id: string;
  startISO: string;
  endISO: string;
  createdISO: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string | null;
  serviceName: string;
  serviceColor: string | null;
  employeeId: string | null;
  employeeName: string | null;
  locationName: string | null;
  locationMode: string | null;
  locationAddress: string | null;
  locationMapUrl: string | null;
  /** Customer-supplied address for a mobile ("we come to you") booking. */
  customerAddress: string | null;
  /** Answers to the service's custom fields (label denormalised for display). */
  customFields: { label: string; value: string }[];
  priceTotal: number;
  currency: string;
  source: string | null;
  notes: string | null;
}

export interface BookingListFilters {
  status?: BookingStatus | 'all';
  employeeId?: string | null;
  from?: Date | null;
  to?: Date | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export interface BookingListResult {
  rows: BookingListRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Count per status for the current non-status filters (drives the facet tabs). */
  statusCounts: Record<string, number>;
}

/** Where-clause shared by the list and the facet counts (excludes the status filter). */
function baseWhere(businessId: string, f: BookingListFilters): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = { businessId };
  if (f.employeeId) where.employeeId = f.employeeId;
  if (f.from || f.to) {
    where.startAt = {};
    if (f.from) where.startAt.gte = f.from;
    if (f.to) where.startAt.lte = f.to;
  }
  const search = f.search?.trim();
  if (search) {
    where.OR = [
      { customer: { firstName: { contains: search, mode: 'insensitive' } } },
      { customer: { lastName: { contains: search, mode: 'insensitive' } } },
      { customer: { email: { contains: search, mode: 'insensitive' } } },
      { service: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  return where;
}

export async function getBookingsList(
  businessId: string,
  filters: BookingListFilters = {},
  db: PrismaClient = prisma,
): Promise<BookingListResult> {
  if (!businessId) throw new Error('getBookingsList requires a businessId.');

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const base = baseWhere(businessId, filters);
  const where: Prisma.BookingWhereInput =
    filters.status && filters.status !== 'all' ? { ...base, status: filters.status } : base;

  const [rows, total, grouped] = await Promise.all([
    db.booking.findMany({
      where,
      orderBy: { startAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        service: { select: { name: true, color: true } },
        employee: { select: { firstName: true, lastName: true } },
        location: {
          select: {
            name: true,
            mode: true,
            address: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            mapUrl: true,
          },
        },
        customFieldValues: { select: { value: true, customField: { select: { label: true } } } },
      },
    }),
    db.booking.count({ where }),
    db.booking.groupBy({ by: ['status'], where: base, _count: true }),
  ]);

  const statusCounts: Record<string, number> = {};
  let allCount = 0;
  for (const g of grouped) {
    statusCounts[g.status] = g._count;
    allCount += g._count;
  }
  statusCounts.all = allCount;

  return {
    rows: rows.map((b) => ({
      id: b.id,
      startISO: b.startAt.toISOString(),
      endISO: b.endAt.toISOString(),
      createdISO: b.createdAt.toISOString(),
      status: b.status,
      customerName: b.customer ? `${b.customer.firstName} ${b.customer.lastName}`.trim() : 'Unknown',
      customerEmail: b.customer?.email ?? null,
      serviceName: b.service?.name ?? 'Service',
      serviceColor: b.service?.color ?? null,
      employeeId: b.employeeId,
      employeeName: b.employee ? `${b.employee.firstName} ${b.employee.lastName}`.trim() : null,
      locationName: b.location?.name ?? null,
      locationMode: b.location?.mode ?? null,
      locationAddress: b.location
        ? [
            b.location.address,
            b.location.addressLine2,
            [[b.location.city, b.location.state].filter(Boolean).join(', '), b.location.postalCode]
              .filter(Boolean)
              .join(' ')
              .trim(),
          ]
            .filter(Boolean)
            .join(', ') || null
        : null,
      locationMapUrl: b.location?.mapUrl ?? null,
      customerAddress: b.customerAddress ?? null,
      customFields: b.customFieldValues.map((v) => ({ label: v.customField.label, value: v.value })),
      priceTotal: Number(b.priceTotal.toString()),
      currency: b.currency,
      source: b.source,
      notes: b.notes,
    })),
    total,
    page,
    pageSize,
    statusCounts,
  };
}
