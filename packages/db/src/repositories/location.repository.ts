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

  // ---- Location notices ---------------------------------------------------
  // Editable banners shown in the booking flow. A null locationId means the
  // notice is business-wide (shown for every location); otherwise it is scoped
  // to that one location. Optional start/end bound when it is live.

  /** Every notice for this tenant, newest first, for the admin workspace. */
  listNotices() {
    return this.db.locationNotice.findMany({
      where: this.scope(),
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  getNotice(id: string) {
    return this.db.locationNotice.findFirst({ where: this.scope({ id }) });
  }

  /** Confirm a location id belongs to this tenant, or throw. Null is allowed (business-wide). */
  private async assertNoticeLocation(locationId: string | null): Promise<void> {
    if (!locationId) return;
    const owned = await this.db.location.findFirst({ where: this.scope({ id: locationId }), select: { id: true } });
    if (!owned) throw new Error('Location not found in this business.');
  }

  async createNotice(data: NoticeInput) {
    await this.assertNoticeLocation(data.locationId ?? null);
    return this.db.locationNotice.create({
      data: {
        businessId: this.businessId,
        locationId: data.locationId ?? null,
        title: data.title ?? null,
        message: data.message,
        level: data.level ?? null,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateNotice(id: string, data: NoticeInput) {
    await this.assertNoticeLocation(data.locationId ?? null);
    // updateMany with a scoped where guarantees we never touch another tenant's row.
    return this.db.locationNotice.updateMany({
      where: this.scope({ id }),
      data: {
        locationId: data.locationId ?? null,
        title: data.title ?? null,
        message: data.message,
        level: data.level ?? null,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  deleteNotice(id: string) {
    return this.db.locationNotice.deleteMany({ where: this.scope({ id }) });
  }
}

/** Fields for creating or updating a location notice. */
export interface NoticeInput {
  /** Null -> business-wide; otherwise scoped to this location. */
  locationId?: string | null;
  title?: string | null;
  message: string;
  /** 'info' | 'warning' | 'critical' (free-form string in the schema). */
  level?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
}
