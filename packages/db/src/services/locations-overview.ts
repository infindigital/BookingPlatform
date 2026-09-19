import type { LocationMode, PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Locations admin read model. Returns every location (active + inactive) with
 * its booking count, so the Locations workspace can render and warn before a
 * delete in a single query.
 */

export interface LocationRow {
  id: string;
  name: string;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  mapUrl: string | null;
  phone: string | null;
  email: string | null;
  instructions: string | null;
  mode: LocationMode;
  timezone: string | null;
  isDefault: boolean;
  isActive: boolean;
  /** Bookings that reference this location (kept, set to null, on delete). */
  bookingCount: number;
  /** Services explicitly offered here (0 = available everywhere). */
  serviceCount: number;
  /** Staff explicitly assigned here (0 = everyone). */
  employeeCount: number;
}

export interface LocationsOverview {
  locations: LocationRow[];
}

export async function getLocationsOverview(
  businessId: string,
  db: PrismaClient = prisma,
): Promise<LocationsOverview> {
  if (!businessId) throw new Error('getLocationsOverview requires a businessId.');

  const locations = await db.location.findMany({
    where: { businessId },
    orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { bookings: true, services: true, employees: true } } },
  });

  return {
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      addressLine2: l.addressLine2,
      city: l.city,
      state: l.state,
      postalCode: l.postalCode,
      country: l.country,
      mapUrl: l.mapUrl,
      phone: l.phone,
      email: l.email,
      instructions: l.instructions,
      mode: l.mode,
      timezone: l.timezone,
      isDefault: l.isDefault,
      isActive: l.isActive,
      bookingCount: l._count.bookings,
      serviceCount: l._count.services,
      employeeCount: l._count.employees,
    })),
  };
}
