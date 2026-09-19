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
  phone: string | null;
  instructions: string | null;
  mode: LocationMode;
  isActive: boolean;
  /** Bookings that reference this location (kept, set to null, on delete). */
  bookingCount: number;
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
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { bookings: true } } },
  });

  return {
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      phone: l.phone,
      instructions: l.instructions,
      mode: l.mode,
      isActive: l.isActive,
      bookingCount: l._count.bookings,
    })),
  };
}
