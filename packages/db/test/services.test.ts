import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { repositoriesFor } from '../src/repositories/index';

const prisma = new PrismaClient();

let businessId = '';
let categoryId = '';
let serviceId = '';

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `svc-${Date.now()}`, name: 'Svc Co' } });
  businessId = biz.id;
  const cat = await prisma.serviceCategory.create({ data: { businessId, name: 'Cat A', sortOrder: 0 } });
  categoryId = cat.id;
  const svc = await prisma.service.create({
    data: { businessId, name: 'Svc', durationMinutes: 30, price: 10, categoryId },
  });
  serviceId = svc.id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('ServiceRepository.update', () => {
  it('updates the price (regression: updateMany must not receive a relation write)', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.services.update(serviceId, { price: 30, categoryId });
    const after = await prisma.service.findUnique({ where: { id: serviceId } });
    expect(Number(after?.price)).toBe(30);
    expect(after?.categoryId).toBe(categoryId);
  });

  it('clears the category with a null scalar FK', async () => {
    const repos = repositoriesFor(businessId, prisma);
    await repos.services.update(serviceId, { categoryId: null });
    const after = await prisma.service.findUnique({ where: { id: serviceId } });
    expect(after?.categoryId).toBeNull();
  });

  it('cannot update another tenant\'s service', async () => {
    const other = await prisma.business.create({ data: { slug: `svc2-${Date.now()}`, name: 'Other' } });
    const repos = repositoriesFor(other.id, prisma);
    const res = await repos.services.update(serviceId, { price: 999 });
    expect(res.count).toBe(0);
    const after = await prisma.service.findUnique({ where: { id: serviceId } });
    expect(Number(after?.price)).toBe(30);
    await prisma.business.deleteMany({ where: { id: other.id } });
  });
});
