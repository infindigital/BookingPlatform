import { Prisma } from '@prisma/client';
import { BaseRepository } from './base';

export interface EmployeeProfileInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  isActive?: boolean;
}

export interface ServiceAssignmentInput {
  serviceId: string;
  priceOverride?: number | null;
}

export interface WorkingWindowInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breaks: { startTime: string; endTime: string; label?: string | null }[];
}

/**
 * Business-scoped employee data access. Composite writes (service assignments,
 * weekly hours) run in a transaction and are validated against the tenant so a
 * caller can never attach another business's service to an employee.
 */
export class EmployeeRepository extends BaseRepository {
  private searchFilter(search?: string): Prisma.EmployeeWhereInput {
    const s = search?.trim();
    if (!s) return {};
    return {
      OR: [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { title: { contains: s, mode: 'insensitive' } },
      ],
    };
  }

  list(args?: { search?: string; includeInactive?: boolean; take?: number; skip?: number }) {
    const where: Prisma.EmployeeWhereInput = {
      ...this.searchFilter(args?.search),
      ...(args?.includeInactive ? {} : { isActive: true }),
    };
    return this.db.employee.findMany({
      where: this.scope(where),
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      take: args?.take ?? 100,
      skip: args?.skip ?? 0,
    });
  }

  count(args?: { search?: string; includeInactive?: boolean }) {
    const where: Prisma.EmployeeWhereInput = {
      ...this.searchFilter(args?.search),
      ...(args?.includeInactive ? {} : { isActive: true }),
    };
    return this.db.employee.count({ where: this.scope(where) });
  }

  getById(id: string) {
    return this.db.employee.findFirst({ where: this.scope({ id }) });
  }

  create(data: EmployeeProfileInput) {
    return this.db.employee.create({
      data: {
        businessId: this.businessId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        title: data.title ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  /** Update a profile; scoped where guarantees we never touch another tenant. */
  update(id: string, data: EmployeeProfileInput) {
    return this.db.employee.updateMany({
      where: this.scope({ id }),
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        title: data.title ?? null,
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
    });
  }

  setActive(id: string, isActive: boolean) {
    return this.db.employee.updateMany({ where: this.scope({ id }), data: { isActive } });
  }

  /**
   * Replace the employee's service assignments. Only services belonging to this
   * tenant are honoured; unknown ids are silently dropped (never cross-tenant).
   */
  async setServices(employeeId: string, assignments: ServiceAssignmentInput[]): Promise<void> {
    const owned = await this.db.employee.findFirst({ where: this.scope({ id: employeeId }), select: { id: true } });
    if (!owned) throw new Error('Employee not found in this business.');

    const requestedIds = assignments.map((a) => a.serviceId);
    const validServices = requestedIds.length
      ? await this.db.service.findMany({ where: { businessId: this.businessId, id: { in: requestedIds } }, select: { id: true } })
      : [];
    const validIds = new Set(validServices.map((s) => s.id));
    const rows = assignments.filter((a) => validIds.has(a.serviceId));

    await this.db.$transaction([
      this.db.employeeService.deleteMany({ where: { businessId: this.businessId, employeeId } }),
      ...(rows.length
        ? [
            this.db.employeeService.createMany({
              data: rows.map((a) => ({
                businessId: this.businessId,
                employeeId,
                serviceId: a.serviceId,
                priceOverride:
                  a.priceOverride === null || a.priceOverride === undefined
                    ? null
                    : new Prisma.Decimal(a.priceOverride),
              })),
            }),
          ]
        : []),
    ]);
  }

  /**
   * Replace the employee's weekly working hours (and their breaks). The whole
   * week is rewritten atomically so availability always reflects the saved state.
   */
  async replaceWeeklyHours(employeeId: string, windows: WorkingWindowInput[], locationId?: string | null): Promise<void> {
    const owned = await this.db.employee.findFirst({ where: this.scope({ id: employeeId }), select: { id: true } });
    if (!owned) throw new Error('Employee not found in this business.');

    await this.db.$transaction(async (tx) => {
      // Breaks cascade-delete with their parent working-hours row.
      await tx.employeeWorkingHours.deleteMany({ where: { businessId: this.businessId, employeeId } });
      for (const w of windows) {
        await tx.employeeWorkingHours.create({
          data: {
            businessId: this.businessId,
            employeeId,
            locationId: locationId ?? null,
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
            breaks: {
              create: w.breaks.map((b) => ({
                businessId: this.businessId,
                startTime: b.startTime,
                endTime: b.endTime,
                label: b.label ?? null,
              })),
            },
          },
        });
      }
    });
  }

  addTimeOff(employeeId: string, input: { startAt: Date; endAt: Date; reason?: string | null; approved?: boolean }) {
    return this.db.timeOff.create({
      data: {
        businessId: this.businessId,
        employeeId,
        startAt: input.startAt,
        endAt: input.endAt,
        reason: input.reason ?? null,
        approved: input.approved ?? true,
      },
    });
  }

  removeTimeOff(id: string) {
    return this.db.timeOff.deleteMany({ where: { businessId: this.businessId, id } });
  }
}
