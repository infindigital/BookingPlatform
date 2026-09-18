import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createBooking } from '../src/booking/create-booking';
import { getCustomersList } from '../src/customers/list';
import { getCustomerDetail } from '../src/customers/detail';
import { repositoriesFor } from '../src/repositories/index';

const prisma = new PrismaClient();

let businessId = '';
let serviceId = '';
let employeeId = '';
let miaId = '';
let leoId = '';
let userId = '';

async function book(customerId: string, iso: string, status: 'COMPLETED' | 'PENDING' | 'CANCELLED') {
  const start = new Date(iso);
  await createBooking(
    { businessId, customerId, serviceId, employeeId, startAt: start, endAt: new Date(start.getTime() + 3_600_000), priceTotal: 100, status },
    prisma,
  );
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `cust-${Date.now()}`, name: 'CRM Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Svc', durationMinutes: 60, price: 100 } })).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'Em', lastName: 'Ployee' } })).id;
  userId = (await prisma.user.create({ data: { businessId, email: `u${Date.now()}@crm.local`, name: 'Staff Sam' } })).id;

  const repos = repositoriesFor(businessId, prisma);
  const mia = await repos.customers.create({ firstName: 'Mia', lastName: 'Stone', email: 'mia@crm.local', phone: '+1 555 7777' });
  const leo = await repos.customers.create({ firstName: 'Leo', lastName: 'Park', email: 'leo@crm.local' });
  miaId = mia.id;
  leoId = leo.id;

  // Mia: two completed (past) + one upcoming pending. Leo: one cancelled.
  await book(miaId, '2020-01-10T10:00:00.000Z', 'COMPLETED');
  await book(miaId, '2020-06-10T10:00:00.000Z', 'COMPLETED');
  await book(miaId, '2999-01-10T10:00:00.000Z', 'PENDING');
  await book(leoId, '2020-02-10T10:00:00.000Z', 'CANCELLED');

  await repos.customers.addNote({ customerId: miaId, authorUserId: userId, body: 'Prefers morning slots.' });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('getCustomersList', () => {
  it('lists customers with aggregates and lifetime spend', async () => {
    const list = await getCustomersList(businessId, {}, prisma);
    expect(list.total).toBe(2);
    const mia = list.rows.find((r) => r.id === miaId)!;
    expect(mia.bookingsCount).toBe(3);
    expect(mia.completedCount).toBe(2);
    expect(mia.upcomingCount).toBe(1);
    expect(mia.totalSpent).toBe(200);
    expect(mia.lastVisitISO?.slice(0, 10)).toBe('2020-06-10');
  });

  it('filters by search (name/email/phone)', async () => {
    expect((await getCustomersList(businessId, { search: 'leo' }, prisma)).total).toBe(1);
    expect((await getCustomersList(businessId, { search: '7777' }, prisma)).rows[0]?.id).toBe(miaId);
    expect((await getCustomersList(businessId, { search: 'nobody' }, prisma)).total).toBe(0);
  });

  it('paginates', async () => {
    const p1 = await getCustomersList(businessId, { page: 1, pageSize: 1 }, prisma);
    expect(p1.rows).toHaveLength(1);
    expect(p1.total).toBe(2);
  });
});

describe('getCustomerDetail', () => {
  it('returns profile, split history, stats and notes with author', async () => {
    const detail = await getCustomerDetail(businessId, miaId, prisma);
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe('Mia Stone');
    expect(detail!.upcoming).toHaveLength(1);
    expect(detail!.past).toHaveLength(2);
    expect(detail!.stats.totalSpent).toBe(200);
    expect(detail!.stats.completedCount).toBe(2);
    expect(detail!.notes[0]?.body).toBe('Prefers morning slots.');
    expect(detail!.notes[0]?.authorName).toBe('Staff Sam');
  });

  it('returns null for another tenant / unknown id', async () => {
    expect(await getCustomerDetail(businessId, 'nope', prisma)).toBeNull();
  });
});
