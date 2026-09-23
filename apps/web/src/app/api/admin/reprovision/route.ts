import { NextResponse } from 'next/server';
import { prisma, seedDemo } from '@booking/db';
import { MIGRATIONS_SQL } from '@/lib/migrations-sql';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * DESTRUCTIVE one-shot database (re)provision, token-gated.
 *
 * Unlike /api/admin/bootstrap (which only CREATEs missing objects and so cannot
 * repair a schema whose tables exist but are missing newer columns), this drops
 * the public schema and rebuilds it from the full migration history (the schema
 * source of truth), then reseeds the demo. Use it when a deployed database has
 * drifted behind the code.
 *
 *   GET /api/admin/reprovision?token=<AUTH_SECRET>&confirm=reset
 *
 * Disabled (404) when AUTH_SECRET is unset. Without confirm=reset it does
 * nothing and just explains what it would do, so a stray hit can never wipe data.
 */
function splitStatements(sql: string): string[] {
  // Prisma migration SQL has no semicolons inside string literals, so a plain
  // split on ';' yields one DDL statement per chunk.
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\s*)+$/.test(s));
}

function clean(e: unknown): string {
  return ((e as Error)?.message ?? String(e)).replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Reprovision disabled (AUTH_SECRET unset).' }, { status: 404 });
  }

  const url = new URL(request.url);
  if ((url.searchParams.get('token') ?? '') !== secret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (url.searchParams.get('confirm') !== 'reset') {
    return NextResponse.json({
      ok: false,
      willDo: 'DROP SCHEMA public CASCADE, rebuild it from all migrations, and reseed the demo. This DELETES all data.',
      howTo: 'Re-run this URL with &confirm=reset appended to proceed.',
    });
  }

  // 0. Prove connectivity and surface the real error if the DB is unreachable.
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (e) {
    logger.error('reprovision.connect.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'connect', error: clean(e) }, { status: 500 });
  }

  // 1. Reset the schema so a drifted database is rebuilt cleanly.
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } catch (e) {
    logger.error('reprovision.reset.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'reset', error: clean(e) }, { status: 500 });
  }

  // 2. Replay the full migration history against the fresh schema.
  let executed = 0;
  const errors: string[] = [];
  for (const stmt of splitStatements(MIGRATIONS_SQL)) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      executed += 1;
    } catch (e) {
      errors.push(clean(e));
    }
  }
  if (errors.length) {
    logger.error('reprovision.migrate.failed', { errors: errors.slice(0, 3) });
    return NextResponse.json(
      { ok: false, step: 'migrate', migrate: { executed, errorCount: errors.length }, firstError: errors[0] },
      { status: 500 },
    );
  }

  // 3. Reseed the demo business + admin.
  try {
    const seed = await seedDemo(prisma, { force: true });
    return NextResponse.json({
      ok: true,
      migrate: { executed },
      seed,
      login: { url: '/admin', email: 'admin@aurora.example', password: 'password123' },
      next: 'Change the demo admin password, then load real data with the Midwest loader.',
    });
  } catch (e) {
    logger.error('reprovision.seed.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'seed', migrate: { executed }, error: clean(e) }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
