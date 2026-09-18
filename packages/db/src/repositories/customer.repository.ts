import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base';

export class CustomerRepository extends BaseRepository {
  list(args?: { search?: string; take?: number; skip?: number }) {
    return this.db.customer.findMany({
      where: this.scope(this.searchFilter(args?.search)),
      orderBy: { createdAt: 'desc' },
      take: args?.take ?? 50,
      skip: args?.skip ?? 0,
    });
  }

  private searchFilter(search?: string): Prisma.CustomerWhereInput {
    const s = search?.trim();
    if (!s) return {};
    return {
      OR: [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ],
    };
  }

  count(args?: { search?: string }) {
    return this.db.customer.count({ where: this.scope(this.searchFilter(args?.search)) });
  }

  getById(id: string) {
    return this.db.customer.findFirst({ where: this.scope({ id }) });
  }

  getByEmail(email: string) {
    return this.db.customer.findFirst({ where: this.scope({ email }) });
  }

  /** Create a customer within the bound tenant. */
  create(data: Omit<Prisma.CustomerUncheckedCreateInput, 'businessId'>) {
    return this.db.customer.create({ data: { ...data, businessId: this.businessId } });
  }

  /** Update a customer; the scoped where guarantees we never touch another tenant. */
  update(id: string, data: Prisma.CustomerUpdateInput) {
    return this.db.customer.updateMany({ where: this.scope({ id }), data });
  }

  addNote(input: { customerId: string; authorUserId?: string | null; body: string }) {
    return this.db.customerNote.create({
      data: {
        businessId: this.businessId,
        customerId: input.customerId,
        authorUserId: input.authorUserId ?? null,
        body: input.body,
      },
    });
  }

  listNotes(customerId: string) {
    return this.db.customerNote.findMany({
      where: this.scope({ customerId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Upsert scoped by (businessId, email) - the tenant-unique key. */
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
