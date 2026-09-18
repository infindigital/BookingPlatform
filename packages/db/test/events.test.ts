import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ValidationError, EventCapacityError, resolveEventInput } from '@booking/core';
import { EventRepository } from '../src/events/event.repository';
import { getEventsList, getEventDetail } from '../src/events/read';

const prisma = new PrismaClient();

let businessId = '';
let otherBusinessId = '';
let hostId = '';
let c1 = '';
let c2 = '';

const START = new Date('2031-06-01T18:00:00Z');
const END = new Date('2031-06-01T20:00:00Z');

async function makeEvent(capacity: number, status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' = 'PUBLISHED') {
  const repo = new EventRepository(businessId, prisma);
  return repo.create(
    resolveEventInput({ title: 'Yoga', startAt: START, endAt: END, capacity, price: 20, currency: 'USD', employeeId: hostId, status }),
  );
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `ev-${Date.now()}`, name: 'Event Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  const other = await prisma.business.create({ data: { slug: `ev2-${Date.now()}`, name: 'Other Co' } });
  otherBusinessId = other.id;
  hostId = (await prisma.employee.create({ data: { businessId, firstName: 'Ivy', lastName: 'Ho' } })).id;
  c1 = (await prisma.customer.create({ data: { businessId, firstName: 'A', lastName: 'One', email: 'a@ev.local' } })).id;
  c2 = (await prisma.customer.create({ data: { businessId, firstName: 'B', lastName: 'Two', email: 'b@ev.local' } })).id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.eventRegistration.deleteMany({ where: { businessId } });
  await prisma.event.deleteMany({ where: { businessId } });
});

describe('event CRUD + read models', () => {
  it('creates an event and lists it with seat figures', async () => {
    await makeEvent(3);
    const list = await getEventsList(businessId, {}, prisma);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Yoga', capacity: 3, registeredSeats: 0, remaining: 3, hostName: 'Ivy Ho' });
  });

  it('validates input on create', () => {
    expect(() => resolveEventInput({ title: '', startAt: START, endAt: END })).toThrow(ValidationError);
  });
});

describe('registration + capacity', () => {
  it('registers seats and tracks remaining capacity', async () => {
    const evt = await makeEvent(3);
    const repo = new EventRepository(businessId, prisma);
    await repo.register({ eventId: evt.id, customerId: c1, seats: 2 });
    let detail = await getEventDetail(businessId, evt.id, prisma);
    expect(detail!.registeredSeats).toBe(2);
    expect(detail!.remaining).toBe(1);
    expect(detail!.registrations).toHaveLength(1);

    await repo.register({ eventId: evt.id, customerId: c2, seats: 1 });
    detail = await getEventDetail(businessId, evt.id, prisma);
    expect(detail!.remaining).toBe(0);
  });

  it('rejects an overbooking', async () => {
    const evt = await makeEvent(2);
    const repo = new EventRepository(businessId, prisma);
    await repo.register({ eventId: evt.id, customerId: c1, seats: 2 });
    await expect(repo.register({ eventId: evt.id, customerId: c2, seats: 1 })).rejects.toBeInstanceOf(EventCapacityError);
  });

  it('frees a seat when a registration is cancelled, then allows a new one', async () => {
    const evt = await makeEvent(1);
    const repo = new EventRepository(businessId, prisma);
    const reg = await repo.register({ eventId: evt.id, customerId: c1, seats: 1 });
    await expect(repo.register({ eventId: evt.id, customerId: c2, seats: 1 })).rejects.toBeInstanceOf(EventCapacityError);

    await repo.setRegistrationStatus(reg.id, 'CANCELLED');
    const detail = await getEventDetail(businessId, evt.id, prisma);
    expect(detail!.remaining).toBe(1);
    const reg2 = await repo.register({ eventId: evt.id, customerId: c2, seats: 1 });
    expect(reg2.id).toBeTruthy();
  });

  it('marking attended keeps the seat occupied', async () => {
    const evt = await makeEvent(1);
    const repo = new EventRepository(businessId, prisma);
    const reg = await repo.register({ eventId: evt.id, customerId: c1, seats: 1 });
    await repo.setRegistrationStatus(reg.id, 'ATTENDED');
    const detail = await getEventDetail(businessId, evt.id, prisma);
    expect(detail!.remaining).toBe(0);
    expect(detail!.attendeeCount).toBe(1);
  });

  it('cannot register into a cancelled event', async () => {
    const evt = await makeEvent(5, 'CANCELLED');
    const repo = new EventRepository(businessId, prisma);
    await expect(repo.register({ eventId: evt.id, customerId: c1, seats: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('under concurrency, a single seat is won by exactly one of two racers', async () => {
    const evt = await makeEvent(1);
    const repo = new EventRepository(businessId, prisma);
    const results = await Promise.allSettled([
      repo.register({ eventId: evt.id, customerId: c1, seats: 1 }),
      repo.register({ eventId: evt.id, customerId: c2, seats: 1 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(EventCapacityError);

    const seats = await prisma.eventRegistration.aggregate({ where: { businessId, eventId: evt.id, status: 'REGISTERED' }, _sum: { seats: true } });
    expect(seats._sum.seats).toBe(1);
  });
});

describe('delete guard + tenant isolation', () => {
  it('blocks deleting an event with registrations but allows an empty one', async () => {
    const repo = new EventRepository(businessId, prisma);
    const used = await makeEvent(3);
    await repo.register({ eventId: used.id, customerId: c1, seats: 1 });
    await expect(repo.delete(used.id)).rejects.toBeInstanceOf(ValidationError);

    const empty = await makeEvent(3);
    const res = await repo.delete(empty.id);
    expect(res.ok).toBe(true);
  });

  it('is tenant-scoped for registration and listing', async () => {
    const evt = await makeEvent(3);
    const foreign = new EventRepository(otherBusinessId, prisma);
    // The other tenant cannot see or register into this event.
    await expect(foreign.register({ eventId: evt.id, customerId: c1, seats: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(await getEventsList(otherBusinessId, {}, prisma)).toHaveLength(0);
  });
});
