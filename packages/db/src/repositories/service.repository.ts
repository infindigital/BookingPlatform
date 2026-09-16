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

  count() {
    return this.db.service.count({ where: this.scope() });
  }
}
