import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base';

export class CustomerRepository extends BaseRepository {
  list(args?: { search?: string; take?: number; skip?: number }) {
    const search = args?.search?.trim();
    const filter: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    return this.db.customer.findMany({
      where: this.scope(filter),
      orderBy: { createdAt: 'desc' },
      take: args?.take ?? 50,
      skip: args?.skip ?? 0,
    });
  }

  getById(id: string) {
    return this.db.customer.findFirst({ where: this.scope({ id }) });
  }

  getByEmail(email: string) {
    return this.db.customer.findFirst({ where: this.scope({ email }) });
  }

  /** Upsert scoped by (businessId, email) — the tenant-unique key. */
  upsertByEmail(
    data: Omit<Prisma.CustomerUncheckedCreateInput, 'businessId'> & { email: string },
  ) {
    return this.db.customer.upsert({
      where: { businessId_email: { businessId: this.businessId, email: data.email } },
      create: { ...data, businessId: this.businessId },
      update: { firstName: data.firstName, lastName: data.lastName, phone: data.phone },
    });
  }
}
