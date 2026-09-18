import { NextResponse } from 'next/server';
import { prisma, seedDemo } from '@booking/db';
import { BOOTSTRAP_SQL } from '@/lib/bootstrap-sql';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * One-time database bootstrap (token-gated).
 *
 * Creates the schema (runs the combined migration SQL) and seeds the demo, at
 * RUNTIME - where DATABASE_URL is guaranteed present - so a deployment platform
 * that can't run migrations during the build can still provision the database by
 * hitting this URL once. Idempotent: table/type "already exists" errors are
 * ignored, and the seed skips when the demo business is already present.
 *
 *   GET /api/admin/bootstrap?token=<AUTH_SECRET>[&force=1]
 *
 * Disabled (404) when AUTH_SECRET is unset. The token must equal AUTH_SECRET.
 */
function splitStatements(sql: string): string[] {
  // The embedded Prisma migration SQL has no semicolons inside string literals,
  // so a plain split on ';' yields one DDL statement per chunk.
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\s*)+$/.test(s));
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: 'Bootstrap disabled (AUTH_SECRET unset).' }, { status: 404 });

  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  if (token !== secret) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const force = url.searchParams.get('force') === '1';
  const clean = (e: unknown) => ((e as Error)?.message ?? String(e)).replace(/\s+/g, ' ').trim().slice(0, 500);

  // 0. Prove we can actually reach the database and reveal the real error if not.
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (e) {
    logger.error('bootstrap.connect.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'connect', error: clean(e) }, { status: 500 });
  }

  let executed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const stmt of splitStatements(BOOTSTRAP_SQL)) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      executed += 1;
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (/already exists|duplicate/i.test(msg)) {
        skipped += 1; // table / type / constraint / index already present
      } else {
        errors.push(clean(e));
      }
    }
  }

  if (errors.length) {
    logger.error('bootstrap.migrate.failed', { errors: errors.slice(0, 3) });
    return NextResponse.json(
      { ok: false, step: 'migrate', migrate: { executed, skipped, errorCount: errors.length }, firstError: errors[0], errors: errors.slice(0, 3) },
      { status: 500 },
    );
  }

  try {
    const seed = await seedDemo(prisma, { force });
    return NextResponse.json({
      ok: true,
      migrate: { executed, skipped },
      seed,
      login: { url: '/admin', email: 'admin@aurora.example', password: 'password123' },
    });
  } catch (e) {
    logger.error('bootstrap.seed.failed', { message: (e as Error)?.message });
    return NextResponse.json(
      { ok: false, step: 'seed', migrate: { executed, skipped }, error: (e as Error)?.message?.slice(0, 300) },
      { status: 500 },
    );
  }
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
