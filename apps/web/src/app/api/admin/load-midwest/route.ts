import { NextResponse } from 'next/server';
import { prisma, loadMidwest } from '@booking/db';
import { MIDWEST_SEED } from '@/lib/midwest-seed';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * One-shot Midwest Identity Services data load, token-gated.
 *
 * Runs the idempotent loader with the committed MIDWEST_SEED so the real service
 * lines (Fingerprinting, Notary, Apostille), a sample staff member, hours, the
 * Kansas City location, and a Midwest admin user are provisioned from the
 * browser (no CLI needed). Additive and safe to re-run; never touches customers
 * or bookings. Requires the schema to already exist (run reprovision first).
 *
 *   GET /api/admin/load-midwest?token=<AUTH_SECRET>
 *
 * Disabled (404) when AUTH_SECRET is unset.
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

function clean(e: unknown): string {
  return ((e as Error)?.message ?? String(e)).replace(/\s+/g, ' ').trim().slice(0, 500);
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Loader disabled (AUTH_SECRET unset).' }, { status: 404 });
  }
  if (rawParam(request.url, 'token') !== secret.trim()) {
    return NextResponse.json(
      { error: 'Unauthorized.', hint: 'Copy the exact AUTH_SECRET value from Vercel env vars.' },
      { status: 401 },
    );
  }

  try {
    const summary = await loadMidwest(prisma, MIDWEST_SEED);
    return NextResponse.json({
      ok: true,
      loaded: summary,
      login: { url: '/admin', email: MIDWEST_SEED.admin.email, password: MIDWEST_SEED.admin.password },
      bookingPage: `/book/${MIDWEST_SEED.business.slug}`,
      next: 'Log out, then log in with the Midwest admin above to see the Midwest catalogue. Change the password after.',
    });
  } catch (e) {
    logger.error('load-midwest.failed', { message: clean(e) });
    return NextResponse.json({ ok: false, error: clean(e) }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
