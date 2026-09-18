import type { PrismaClient } from '@prisma/client';
import { prisma } from '../client';
import { loadResolvedForm, type ResolvedForm } from '../form/config';

/**
 * Public booking read model. Returns only what is safe to expose on the
 * customer-facing booking page for a business, resolved by its public `slug`.
 *
 * Deliberately narrow: no customer records, no other bookings, no internal
 * notes, no credentials - just the catalogue a visitor needs to book. Every
 * query is scoped to the resolved tenant.
 */

export interface PublicBusiness {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  email: string | null;
  phone: string | null;
}

export interface PublicServiceCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface PublicService {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  color: string | null;
}

export interface PublicEmployee {
  id: string;
  name: string;
  title: string | null;
  serviceIds: string[];
}

export interface PublicBookingData {
  business: PublicBusiness;
  categories: PublicServiceCategory[];
  services: PublicService[];
  employees: PublicEmployee[];
  /** Resolved Form Designer configuration: theme tokens, settings and steps. */
  form: ResolvedForm;
}

export async function getPublicBookingData(
  slug: string,
  db: PrismaClient = prisma,
): Promise<PublicBookingData | null> {
  if (!slug) return null;

  const business = await db.business.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, timezone: true, currency: true, email: true, phone: true },
  });
  if (!business) return null;
  const businessId = business.id;

  const [categories, services, employees, form] = await Promise.all([
    db.serviceCategory.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true },
    }),
    db.service.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        durationMinutes: true,
        price: true,
        color: true,
      },
    }),
    db.employee.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        services: { select: { serviceId: true } },
      },
    }),
    loadResolvedForm(businessId, db),
  ]);

  return {
    business,
    form,
    categories,
    services: services.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      price: Number(s.price),
      color: s.color,
    })),
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      title: e.title,
      serviceIds: e.services.map((es) => es.serviceId),
    })),
  };
}
