import type { LocationMode, PrismaClient } from '@prisma/client';
import type { CustomFieldDef } from '@booking/core';
import { prisma } from '../client';
import { optionsToArray } from '../repositories/custom-field.repository';
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
  /** Locations this service is offered at (empty = every location). */
  locationIds: string[];
  /** Extra questions to ask on the booking form for this service. */
  fields: CustomFieldDef[];
}

export interface PublicEmployee {
  id: string;
  name: string;
  title: string | null;
  serviceIds: string[];
  /** Locations this employee works at (empty = every location). */
  locationIds: string[];
}

export interface PublicLocation {
  id: string;
  name: string;
  mode: LocationMode;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  mapUrl: string | null;
  phone: string | null;
  instructions: string | null;
  isDefault: boolean;
}

/**
 * A customer-facing notice/banner. A null locationId means it is business-wide
 * (shown for every location); otherwise it is scoped to that one location.
 * Only notices that are active and within their optional time window are
 * returned.
 */
export interface PublicNotice {
  id: string;
  locationId: string | null;
  title: string | null;
  message: string;
  level: string | null;
}

export interface PublicBookingData {
  business: PublicBusiness;
  categories: PublicServiceCategory[];
  services: PublicService[];
  employees: PublicEmployee[];
  /** Active bookable locations (empty when the business runs a single implicit site). */
  locations: PublicLocation[];
  /** Active notices to surface in the booking flow (business-wide + location-scoped). */
  notices: PublicNotice[];
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

  const now = new Date();
  const [categories, services, employees, locations, notices, customFields, form] = await Promise.all([
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
        locations: { select: { locationId: true } },
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
        locations: { select: { locationId: true } },
      },
    }),
    db.location.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        mode: true,
        address: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        mapUrl: true,
        phone: true,
        instructions: true,
        isDefault: true,
      },
    }),
    db.locationNotice.findMany({
      where: {
        businessId,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, locationId: true, title: true, message: true, level: true },
    }),
    db.customField.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, serviceId: true, label: true, type: true, required: true, options: true, placeholder: true },
    }),
    loadResolvedForm(businessId, db),
  ]);

  // Fields with a null serviceId apply to every service; the rest only to theirs.
  const globalFields = customFields.filter((f) => f.serviceId === null);
  const toDef = (f: (typeof customFields)[number]): CustomFieldDef => ({
    id: f.id,
    label: f.label,
    type: f.type,
    required: f.required,
    options: optionsToArray(f.options),
    placeholder: f.placeholder,
  });
  const fieldsForService = (serviceId: string): CustomFieldDef[] =>
    [...customFields.filter((f) => f.serviceId === serviceId), ...globalFields].map(toDef);

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
      locationIds: s.locations.map((sl) => sl.locationId),
      fields: fieldsForService(s.id),
    })),
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      title: e.title,
      serviceIds: e.services.map((es) => es.serviceId),
      locationIds: e.locations.map((el) => el.locationId),
    })),
    locations,
    notices,
  };
}
