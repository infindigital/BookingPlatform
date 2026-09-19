import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Services admin read model. Returns every service (active + inactive) with its
 * category name and usage counts, plus the category list and the business
 * currency, so the Services workspace can render and gate deletes in one query.
 */

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  price: number;
  color: string | null;
  isActive: boolean;
  /** Team members who can perform this service. */
  employeeCount: number;
  /** Bookings referencing this service (a service with bookings can't be deleted). */
  bookingCount: number;
}

export interface ServiceCategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  serviceCount: number;
}

export interface ServicesOverview {
  services: ServiceRow[];
  categories: ServiceCategoryRow[];
  currency: string;
}

export async function getServicesOverview(
  businessId: string,
  db: PrismaClient = prisma,
): Promise<ServicesOverview> {
  if (!businessId) throw new Error('getServicesOverview requires a businessId.');

  const [business, services, categories] = await Promise.all([
    db.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
    db.service.findMany({
      where: { businessId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        category: { select: { name: true } },
        _count: { select: { employees: true, bookings: true } },
      },
    }),
    db.serviceCategory.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { services: true } } },
    }),
  ]);

  return {
    currency: business?.currency ?? 'USD',
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      categoryId: s.categoryId,
      categoryName: s.category?.name ?? null,
      durationMinutes: s.durationMinutes,
      bufferBeforeMinutes: s.bufferBeforeMinutes,
      bufferAfterMinutes: s.bufferAfterMinutes,
      price: Number(s.price.toString()),
      color: s.color,
      isActive: s.isActive,
      employeeCount: s._count.employees,
      bookingCount: s._count.bookings,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      serviceCount: c._count.services,
    })),
  };
}
