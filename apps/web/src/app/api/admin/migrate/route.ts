import { NextResponse } from 'next/server';
import { prisma, loadMidwest } from '@booking/db';
import { MIGRATIONS_SQL } from '@/lib/migrations-sql';
import { MIDWEST_SEED } from '@/lib/midwest-seed';
import { syncSchema } from '@/lib/schema-sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * NON-DESTRUCTIVE schema update, token-gated.
 *
 * Unlike /api/admin/reprovision (which DROPs the schema and reseeds, wiping all
 * data), this brings a drifted database up to the current schema by replaying
 * the additive migration history with IF NOT EXISTS semantics. Existing tables,
 * columns and data are preserved; only missing objects are created. This is what
 * repairs "column does not exist" failures (e.g. editing a service price) after
 * a deploy, without ever deleting your Midwest data.
 *
 * If - and only if - the Midwest business is absent (a brand-new database), the
 * Midwest catalogue is loaded so the app is not left empty. When the business
 * already exists, nothing is seeded, so admin edits are never overwritten.
 *
 *   GET /api/admin/migrate?token=<AUTH_SECRET>
 *
 * Safe to run any time and as often as needed - it is idempotent.
 */
function clean(e: unknown): string {
  return ((e as Error)?.message ?? String(e)).replace(/\s+/g, ' ').trim().slice(0, 500);
}

/**
 * Read a query param from the RAW query string so a base64 AUTH_SECRET (which may
 * contain "+") is not mangled by URLSearchParams turning "+" into a space.
 */
function rawParam(requestUrl: string, key: string): string {
  const query = requestUrl.split('?')[1] ?? '';
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const k = eq === -1 ? pair : pair.slice(0, eq);
    if (k === key) {
      const raw = eq === -1 ? '' : pair.slice(eq + 1);
      try {
        return decodeURIComponent(raw).trim();
      } catch {
        return raw.trim();
      }
    }
  }
  return '';
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Migrate disabled (AUTH_SECRET unset).' }, { status: 404 });
  }

  const token = rawParam(request.url, 'token');
  if (token !== secret.trim()) {
    return NextResponse.json(
      {
        error: 'Unauthorized.',
        hint: 'The token query param did not match AUTH_SECRET. Copy the exact AUTH_SECRET value from Vercel env vars; special characters like + / = are handled automatically.',
      },
      { status: 401 },
    );
  }

  // Prove connectivity and surface the real error if the DB is unreachable.
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (e) {
    logger.error('migrate.connect.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'connect', error: clean(e) }, { status: 500 });
  }

  // 1. Bring the schema up to date without dropping anything.
  const sync = await syncSchema(prisma, MIGRATIONS_SQL);
  if (sync.errors.length) {
    logger.error('migrate.sync.failed', { errors: sync.errors.slice(0, 3) });
    return NextResponse.json({ ok: false, step: 'sync', sync }, { status: 500 });
  }

  // 2. Seed Midwest only when the database is empty of it, so existing data and
  //    admin edits are never overwritten.
  let seeded = false;
  try {
    const existing = await prisma.business.findFirst({
      where: { slug: MIDWEST_SEED.business.slug },
      select: { id: true },
    });
    if (!existing) {
      await loadMidwest(prisma, MIDWEST_SEED);
      seeded = true;
    }
  } catch (e) {
    logger.error('migrate.seed.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'seed', sync, error: clean(e) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sync,
    seeded,
    dataPreserved: !seeded,
    message: seeded
      ? 'Schema updated and the Midwest catalogue loaded into an empty database.'
      : 'Schema updated. Your existing data was preserved - nothing was wiped or reseeded.',
  });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
