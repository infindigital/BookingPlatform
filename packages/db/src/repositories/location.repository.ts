import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base';

export class LocationRepository extends BaseRepository {
  list(args?: { includeInactive?: boolean }) {
    return this.db.location.findMany({
      where: this.scope(args?.includeInactive ? {} : { isActive: true }),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  getById(id: string) {
    return this.db.location.findFirst({ where: this.scope({ id }) });
  }

  create(data: Omit<Prisma.LocationUncheckedCreateInput, 'businessId'>) {
    return this.db.location.create({ data: { ...data, businessId: this.businessId } });
  }

  update(id: string, data: Prisma.LocationUpdateInput) {
    // updateMany with a scoped where guarantees we never touch another tenant's row.
    return this.db.location.updateMany({ where: this.scope({ id }), data });
  }

  /** Hard-delete a location. Bookings/hours point at it via SetNull/Cascade - see schema. */
  delete(id: string) {
    return this.db.location.deleteMany({ where: this.scope({ id }) });
  }

  /** Bookings referencing this location. Used to warn before deleting. */
  bookingCount(id: string) {
    return this.db.booking.count({ where: this.scope({ locationId: id }) });
  }

  /** Clear the default flag on every other location, so at most one is default. */
  clearDefault(exceptId?: string) {
    return this.db.location.updateMany({
      where: this.scope(exceptId ? { isDefault: true, id: { not: exceptId } } : { isDefault: true }),
      data: { isDefault: false },
    });
  }

  /**
   * Replace the services offered at this location. Only services belonging to
   * this tenant are honoured; unknown ids are silently dropped (never
   * cross-tenant). An empty list means "no explicit rows" -> the location
   * offers every service (backward-compatible default).
   */
  async setServices(locationId: string, serviceIds: string[]): Promise<void> {
    const owned = await this.db.location.findFirst({ where: this.scope({ id: locationId }), select: { id: true } });
    if (!owned) throw new Error('Location not found in this business.');

    const unique = [...new Set(serviceIds)];
    const valid = unique.length
      ? await this.db.service.findMany({
          where: { businessId: this.businessId, id: { in: unique } },
          select: { id: true },
        })
      : [];
    const validIds = valid.map((s) => s.id);

    await this.db.$transaction([
      this.db.serviceLocation.deleteMany({ where: { businessId: this.businessId, locationId } }),
      ...(validIds.length
        ? [
            this.db.serviceLocation.createMany({
              data: validIds.map((serviceId) => ({ businessId: this.businessId, locationId, serviceId })),
            }),
          ]
        : []),
    ]);
  }

  /**
   * Replace the staff assigned to this location. Only employees belonging to
   * this tenant are honoured. An empty list means "no explicit rows" -> every
   * employee can work here (backward-compatible default).
   */
  async setEmployees(locationId: string, employeeIds: string[]): Promise<void> {
    const owned = await this.db.location.findFirst({ where: this.scope({ id: locationId }), select: { id: true } });
    if (!owned) throw new Error('Location not found in this business.');

    const unique = [...new Set(employeeIds)];
    const valid = unique.length
      ? await this.db.employee.findMany({
          where: { businessId: this.businessId, id: { in: unique } },
          select: { id: true },
        })
      : [];
    const validIds = valid.map((e) => e.id);

    await this.db.$transaction([
      this.db.employeeLocation.deleteMany({ where: { businessId: this.businessId, locationId } }),
      ...(validIds.length
        ? [
            this.db.employeeLocation.createMany({
              data: validIds.map((employeeId) => ({ businessId: this.businessId, locationId, employeeId })),
            }),
          ]
        : []),
    ]);
  }

  count() {
    return this.db.location.count({ where: this.scope() });
  }
}
