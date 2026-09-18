import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { resolveWebsiteByPublicKey } from '../src/public/website';

const prisma = new PrismaClient();

let businessId = '';
const activeKey = `pk_active_${Date.now()}`;
const inactiveKey = `pk_inactive_${Date.now()}`;

beforeAll(async () => {
  const biz = await prisma.business.create({
    data: { slug: `web-${Date.now()}`, name: 'Widget Co', timezone: 'UTC', currency: 'USD' },
  });
  businessId = biz.id;
  await prisma.website.create({
    data: { businessId, name: 'Main Site', domain: 'widget.example', publicKey: activeKey, isActive: true },
  });
  await prisma.website.create({
    data: { businessId, name: 'Old Site', domain: null, publicKey: inactiveKey, isActive: false },
  });
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('resolveWebsiteByPublicKey', () => {
  it('resolves an active key to the business identity', async () => {
    const w = await resolveWebsiteByPublicKey(activeKey, prisma);
    expect(w).not.toBeNull();
    expect(w).toMatchObject({
      businessId,
      businessName: 'Widget Co',
      domain: 'widget.example',
    });
    expect(w?.slug).toMatch(/^web-/);
  });

  it('returns null for a disabled key', async () => {
    expect(await resolveWebsiteByPublicKey(inactiveKey, prisma)).toBeNull();
  });

  it('returns null for an unknown key', async () => {
    expect(await resolveWebsiteByPublicKey('pk_does_not_exist', prisma)).toBeNull();
  });

  it('returns null for an empty/whitespace key', async () => {
    expect(await resolveWebsiteByPublicKey('', prisma)).toBeNull();
    expect(await resolveWebsiteByPublicKey('   ', prisma)).toBeNull();
  });

  it('trims a padded key', async () => {
    const w = await resolveWebsiteByPublicKey(`  ${activeKey}  `, prisma);
    expect(w?.businessId).toBe(businessId);
  });
});
