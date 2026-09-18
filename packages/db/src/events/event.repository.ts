import { Prisma } from '@prisma/client';
import {
  ValidationError,
  EventCapacityError,
  occupiedSeats,
  canRegister,
  occupiesSeat,
  type ResolvedEvent,
  type EventStatus,
  type EventRegistrationStatus,
} from '@booking/core';
import { BaseRepository } from '../repositories/base';
import { forUpdateByIdAndBusiness } from '../dialect';

export interface RegisterInput {
  eventId: string;
  customerId: string;
  seats?: number;
  note?: string | null;
}

interface LockedEventRow {
  id: string;
  capacity: number;
  status: EventStatus;
}

/**
 * Business-scoped events data access. Registration is capacity-safe under
 * concurrency: it takes a `FOR UPDATE` row lock on the Event inside a
 * transaction (the same portable strategy the booking engine uses for
 * double-booking), recounts occupied seats, and rejects an overbooking so
 * exactly one of two racing sold-out-line registrations can win.
 */
export class EventRepository extends BaseRepository {
  list(args?: { status?: EventStatus; includeCancelled?: boolean; take?: number; skip?: number }) {
    const where: Prisma.EventWhereInput = {
      ...(args?.status ? { status: args.status } : args?.includeCancelled ? {} : { status: { not: 'CANCELLED' } }),
    };
    return this.db.event.findMany({
      where: this.scope(where),
      orderBy: [{ startAt: 'desc' }],
      take: args?.take ?? 100,
      skip: args?.skip ?? 0,
      include: {
        location: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
        registrations: { select: { seats: true, status: true } },
      },
    });
  }

  getById(id: string) {
    return this.db.event.findFirst({
      where: this.scope({ id }),
      include: {
        location: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
        registrations: {
          orderBy: { createdAt: 'asc' },
          include: { customer: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    });
  }

  create(data: ResolvedEvent) {
    return this.db.event.create({
      data: {
        businessId: this.businessId,
        title: data.title,
        description: data.description,
        startAt: data.startAt,
        endAt: data.endAt,
        capacity: data.capacity,
        price: new Prisma.Decimal(data.price),
        currency: data.currency,
        locationId: data.locationId,
        employeeId: data.employeeId,
        status: data.status,
      },
    });
  }

  update(id: string, data: ResolvedEvent) {
    return this.db.event.updateMany({
      where: this.scope({ id }),
      data: {
        title: data.title,
        description: data.description,
        startAt: data.startAt,
        endAt: data.endAt,
        capacity: data.capacity,
        price: new Prisma.Decimal(data.price),
        currency: data.currency,
        locationId: data.locationId,
        employeeId: data.employeeId,
        status: data.status,
      },
    });
  }

  setStatus(id: string, status: EventStatus) {
    return this.db.event.updateMany({ where: this.scope({ id }), data: { status } });
  }

  /** Delete an event that has no registrations; otherwise cancel it instead. */
  async delete(id: string): Promise<{ ok: boolean; reason?: 'not_found' }> {
    const owned = await this.db.event.findFirst({ where: this.scope({ id }), select: { id: true } });
    if (!owned) return { ok: false, reason: 'not_found' };
    const regs = await this.db.eventRegistration.count({ where: this.scope({ eventId: id }) });
    if (regs > 0) throw new ValidationError('This event has registrations. Cancel it instead of deleting.');
    await this.db.event.delete({ where: { id } });
    return { ok: true };
  }

  /** Register a customer for one or more seats — capacity-safe under concurrency. */
  async register(input: RegisterInput) {
    const seats = Math.max(1, Math.floor(input.seats ?? 1));
    return this.db.$transaction(async (tx) => {
      // Serialise concurrent registrations for this event (portable row lock).
      const locked = await tx.$queryRawUnsafe<LockedEventRow[]>(
        forUpdateByIdAndBusiness('Event', 'id, capacity, status'),
        input.eventId,
        this.businessId,
      );
      const evt = locked[0];
      if (!evt) throw new ValidationError('Event not found.');
      if (evt.status === 'CANCELLED' || evt.status === 'COMPLETED') {
        throw new ValidationError('This event is not open for registration.');
      }

      const customer = await tx.customer.findFirst({ where: { id: input.customerId, businessId: this.businessId }, select: { id: true } });
      if (!customer) throw new ValidationError('Customer not found in this business.');

      const regs = await tx.eventRegistration.findMany({
        where: { businessId: this.businessId, eventId: input.eventId },
        select: { seats: true, status: true },
      });
      if (!canRegister(Number(evt.capacity), occupiedSeats(regs), seats)) {
        throw new EventCapacityError();
      }

      return tx.eventRegistration.create({
        data: { businessId: this.businessId, eventId: input.eventId, customerId: input.customerId, seats, note: input.note ?? null },
      });
    });
  }

  /**
   * Change a registration's status. Moving *into* a seat-occupying status from a
   * freed one re-checks capacity under a lock so a re-registration can't
   * overbook; freeing or same-occupancy transitions are a plain scoped update.
   */
  async setRegistrationStatus(id: string, status: EventRegistrationStatus): Promise<{ count: number }> {
    const reg = await this.db.eventRegistration.findFirst({
      where: this.scope({ id }),
      select: { id: true, eventId: true, seats: true, status: true },
    });
    if (!reg) return { count: 0 };

    if (occupiesSeat(status) && !occupiesSeat(reg.status)) {
      return this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRawUnsafe<LockedEventRow[]>(
          forUpdateByIdAndBusiness('Event', 'id, capacity, status'),
          reg.eventId,
          this.businessId,
        );
        const evt = locked[0];
        if (!evt) throw new ValidationError('Event not found.');
        const others = await tx.eventRegistration.findMany({
          where: { businessId: this.businessId, eventId: reg.eventId, id: { not: id } },
          select: { seats: true, status: true },
        });
        if (!canRegister(Number(evt.capacity), occupiedSeats(others), reg.seats)) {
          throw new EventCapacityError();
        }
        await tx.eventRegistration.updateMany({ where: { businessId: this.businessId, id }, data: { status } });
        return { count: 1 };
      });
    }

    await this.db.eventRegistration.updateMany({ where: this.scope({ id }), data: { status } });
    return { count: 1 };
  }
}
