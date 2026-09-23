import { NextResponse } from 'next/server';
import { prisma, loadMidwest } from '@booking/db';
import { MIGRATIONS_SQL } from '@/lib/migrations-sql';
import { MIDWEST_SEED } from '@/lib/midwest-seed';
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
 * source of truth), then loads the real Midwest Identity Services catalogue.
 * Use it when a deployed database has drifted behind the code, or to (re)build a
 * clean single-tenant Midwest database. No demo/sample business is created and no
 * fake customers or bookings are ever seeded.
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

/**
 * Read a query param from the RAW query string. URLSearchParams turns "+" into a
 * space, which silently breaks a base64 AUTH_SECRET (openssl rand -base64 emits
 * "+" and "/"), so pasting the secret straight into the URL would never match.
 * Reading raw and decoding with decodeURIComponent preserves "+".
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
    return NextResponse.json({ error: 'Reprovision disabled (AUTH_SECRET unset).' }, { status: 404 });
  }

  const url = new URL(request.url);
  const token = rawParam(request.url, 'token');
  if (token !== secret.trim()) {
    return NextResponse.json(
      {
        error: 'Unauthorized.',
        hint: 'The token query param did not match AUTH_SECRET. Copy the exact AUTH_SECRET value from Vercel env vars; special characters like + / = are handled automatically now.',
      },
      { status: 401 },
    );
  }

  if (url.searchParams.get('confirm') !== 'reset') {
    return NextResponse.json({
      ok: false,
      willDo:
        'DROP SCHEMA public CASCADE, rebuild it from all migrations, and load the Midwest Identity Services catalogue. This DELETES all data.',
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

  // 3. Load the real Midwest catalogue (business, hours, services, staff, days
  //    off, special days, admin). No demo business and no fake data.
  try {
    const loaded = await loadMidwest(prisma, MIDWEST_SEED);
    return NextResponse.json({
      ok: true,
      migrate: { executed },
      loaded,
      login: { url: '/admin', email: MIDWEST_SEED.admin.email, password: MIDWEST_SEED.admin.password },
      bookingPage: `/book/${MIDWEST_SEED.business.slug}`,
      next: 'Log in with the Midwest admin above, then change the password.',
    });
  } catch (e) {
    logger.error('reprovision.load.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, step: 'load', migrate: { executed }, error: clean(e) }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
