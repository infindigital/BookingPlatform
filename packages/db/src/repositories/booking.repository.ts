import type { BookingStatus, Prisma } from '@prisma/client';
import { BaseRepository } from './base';
import { createBooking, type CreateBookingInput } from '../booking/create-booking';

export class BookingRepository extends BaseRepository {
  list(args?: { status?: BookingStatus; from?: Date; to?: Date; take?: number; skip?: number }) {
    const where: Prisma.BookingWhereInput = {};
    if (args?.status) where.status = args.status;
    if (args?.from || args?.to) {
      where.startAt = {};
      if (args.from) where.startAt.gte = args.from;
      if (args.to) where.startAt.lte = args.to;
    }
    return this.db.booking.findMany({
      where: this.scope(where),
      orderBy: { startAt: 'asc' },
      take: args?.take ?? 100,
      skip: args?.skip ?? 0,
      include: { customer: true, service: true, employee: true },
    });
  }

  getById(id: string) {
    return this.db.booking.findFirst({
      where: this.scope({ id }),
      include: { customer: true, service: true, employee: true, payment: true, items: true },
    });
  }

  count(status?: BookingStatus) {
    return this.db.booking.count({ where: this.scope(status ? { status } : {}) });
  }

  /**
   * Transaction-safe create. businessId is forced from the repository scope so a
   * caller cannot create a booking under a different tenant.
   */
  create(input: Omit<CreateBookingInput, 'businessId'>) {
    return createBooking({ ...input, businessId: this.businessId }, this.db);
  }
}
