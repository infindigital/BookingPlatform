import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient singleton. In dev the module can be re-evaluated on HMR, so we
 * cache the instance on globalThis to avoid exhausting DB connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
