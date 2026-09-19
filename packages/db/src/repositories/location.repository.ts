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

  count() {
    return this.db.location.count({ where: this.scope() });
  }
}
