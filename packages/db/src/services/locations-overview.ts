import type { LocationMode, PrismaClient } from '@prisma/client';
import { prisma } from '../client';

/**
 * Locations admin read model. Returns every location (active + inactive) with
 * its booking count and its explicit service/staff assignments, plus the full
 * lists of services and employees that can be assigned, so the Locations
 * workspace can render, edit assignments and warn before a delete without extra
 * round-trips.
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
  /** Services explicitly offered here (empty = available everywhere). */
  serviceIds: string[];
  /** Staff explicitly assigned here (empty = everyone works here). */
  employeeIds: string[];
}

/** A service that can be offered at a location. */
export interface AssignableService {
  id: string;
  name: string;
  isActive: boolean;
}

/** An employee that can be assigned to a location. */
export interface AssignableEmployee {
  id: string;
  name: string;
  isActive: boolean;
}

/** An editable notice/banner shown in the booking flow. */
export interface NoticeRow {
  id: string;
  /** Null -> business-wide; otherwise scoped to this location. */
  locationId: string | null;
  /** Location name for display, or null when business-wide. */
  locationName: string | null;
  title: string | null;
  message: string;
  level: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export interface LocationsOverview {
  locations: LocationRow[];
  services: AssignableService[];
  employees: AssignableEmployee[];
  notices: NoticeRow[];
}

export async function getLocationsOverview(
  businessId: string,
  db: PrismaClient = prisma,
): Promise<LocationsOverview> {
  if (!businessId) throw new Error('getLocationsOverview requires a businessId.');

  const [locations, services, employees, notices] = await Promise.all([
    db.location.findMany({
      where: { businessId },
      orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { bookings: true } },
        services: { select: { serviceId: true } },
        employees: { select: { employeeId: true } },
      },
    }),
    db.service.findMany({
      where: { businessId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true },
    }),
    db.employee.findMany({
      where: { businessId },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, isActive: true },
    }),
    db.locationNotice.findMany({
      where: { businessId },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      include: { location: { select: { name: true } } },
    }),
  ]);

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
      serviceIds: l.services.map((s) => s.serviceId),
      employeeIds: l.employees.map((e) => e.employeeId),
    })),
    services: services.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive })),
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      isActive: e.isActive,
    })),
    notices: notices.map((n) => ({
      id: n.id,
      locationId: n.locationId,
      locationName: n.location?.name ?? null,
      title: n.title,
      message: n.message,
      level: n.level,
      startsAt: n.startsAt ? n.startsAt.toISOString() : null,
      endsAt: n.endsAt ? n.endsAt.toISOString() : null,
      isActive: n.isActive,
    })),
  };
}
