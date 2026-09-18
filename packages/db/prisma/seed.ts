/**
 * Demo seed CLI — thin wrapper over the reusable `seedDemo` (src/seed/demo-seed).
 * Runs against the free/local Postgres dev database (or any DATABASE_URL).
 * Set SEED_FORCE=1 to rebuild the demo business's data from scratch.
 */
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../src/seed/demo-seed';

const prisma = new PrismaClient();

seedDemo(prisma, { force: process.env.SEED_FORCE === '1' })
  .then((summary) => {
    // eslint-disable-next-line no-console
    console.log(summary.seeded ? 'Seed complete:' : 'Seed skipped (demo already present; SEED_FORCE=1 to rebuild).', summary);
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
