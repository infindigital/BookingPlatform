/**
 * Production loader CLI for Midwest Identity Services.
 *
 * Reads a JSON data file (default: prisma/data/midwest.json) and applies it to
 * the database pointed to by DATABASE_URL. Idempotent - safe to re-run. It never
 * creates customers or bookings.
 *
 *   MIDWEST_DATA=prisma/data/midwest.json pnpm --filter @booking/db load:midwest
 *
 * The committed prisma/data/midwest.template.json is a placeholder with no real
 * values; copy it to prisma/data/midwest.json and fill in the real details
 * before running. (midwest.json is gitignored so real data never gets committed.)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadMidwest, type MidwestData } from '../src/seed/midwest-load';

const dataPath = resolve(process.env.MIDWEST_DATA ?? 'prisma/data/midwest.json');

function readData(): MidwestData {
  let raw: string;
  try {
    raw = readFileSync(dataPath, 'utf8');
  } catch {
    throw new Error(
      `Could not read ${dataPath}. Copy prisma/data/midwest.template.json to prisma/data/midwest.json and fill it in, or set MIDWEST_DATA.`,
    );
  }
  return JSON.parse(raw) as MidwestData;
}

const prisma = new PrismaClient();

loadMidwest(prisma, readData())
  .then((summary) => {
    // eslint-disable-next-line no-console
    console.log('Midwest load complete:', summary);
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
