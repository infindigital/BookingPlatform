import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base';

export class ServiceRepository extends BaseRepository {
  list(args?: { includeInactive?: boolean }) {
    return this.db.service.findMany({
      where: this.scope(args?.includeInactive ? {} : { isActive: true }),
      orderBy: { name: 'asc' },
      include: { category: true },
    });
  }

  getById(id: string) {
    return this.db.service.findFirst({ where: this.scope({ id }) });
  }

  create(data: Omit<Prisma.ServiceUncheckedCreateInput, 'businessId'>) {
    return this.db.service.create({ data: { ...data, businessId: this.businessId } });
  }

  update(id: string, data: Prisma.ServiceUpdateInput) {
    // updateMany with scoped where guarantees we never touch another tenant's row.
    return this.db.service.updateMany({ where: this.scope({ id }), data });
  }

  /** Hard-delete a service. Blocked by the DB (onDelete: Restrict) if bookings reference it. */
  delete(id: string) {
    return this.db.service.deleteMany({ where: this.scope({ id }) });
  }

  /** How many bookings reference this service - a service with bookings can't be hard-deleted. */
  bookingCount(id: string) {
    return this.db.booking.count({ where: this.scope({ serviceId: id }) });
  }

  count() {
    return this.db.service.count({ where: this.scope() });
  }

  // --- Categories -----------------------------------------------------------

  listCategories() {
    return this.db.serviceCategory.findMany({
      where: this.scope(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createCategory(data: { name: string; sortOrder?: number }) {
    return this.db.serviceCategory.create({
      data: { businessId: this.businessId, name: data.name, sortOrder: data.sortOrder ?? 0 },
    });
  }

  /** Delete a category. Services keep existing (categoryId is set to null by the DB). */
  deleteCategory(id: string) {
    return this.db.serviceCategory.deleteMany({ where: this.scope({ id }) });
  }
}
