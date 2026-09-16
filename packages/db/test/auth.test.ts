import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { findUserForAuth } from '../src/auth/lookup';

const prisma = new PrismaClient();
let businessId = '';

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `auth-${Date.now()}`, name: 'Auth Co' } });
  businessId = biz.id;
  const role = await prisma.role.create({ data: { businessId, name: 'Administrator' } });
  const perm = await prisma.permission.upsert({
    where: { key: 'booking.approve' },
    update: {},
    create: { key: 'booking.approve' },
  });
  await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
  const user = await prisma.user.create({
    data: {
      businessId,
      email: 'auth-user@test.local',
      name: 'Auth User',
      passwordHash: await hashPassword('s3cret!'),
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
});

afterAll(async () => {
  await prisma.business.delete({ where: { id: businessId } });
  await prisma.$disconnect();
});

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('hunter2');
    expect(hash).not.toBe('hunter2');
    expect(await verifyPassword('hunter2', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('findUserForAuth', () => {
  it('returns the user with aggregated permissions', async () => {
    const user = await findUserForAuth('auth-user@test.local');
    expect(user).not.toBeNull();
    expect(user!.businessId).toBe(businessId);
    expect(user!.roles).toContain('Administrator');
    expect(user!.permissions).toContain('booking.approve');
  });

  it('returns null for an unknown email', async () => {
    expect(await findUserForAuth('nobody@test.local')).toBeNull();
  });
});
