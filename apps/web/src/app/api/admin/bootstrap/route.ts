import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Deprecated. This endpoint used to create the schema from a hand-maintained SQL
 * blob and seed a demo (Aurora) business. That path drifted behind the real
 * migrations and seeded a sample tenant we no longer want.
 *
 * Provisioning is now a single, authoritative path:
 *   1. /api/admin/reprovision?token=<AUTH_SECRET>&confirm=reset
 *      -> rebuilds the schema from the real migrations and loads the Midwest
 *         Identity Services catalogue (no demo business, no fake data).
 *   2. /api/admin/load-midwest?token=<AUTH_SECRET>
 *      -> re-runs the idempotent Midwest data load (safe to repeat).
 *
 * Kept as a token-gated no-op so old bookmarks fail loudly with guidance rather
 * than silently resurrecting a demo business.
 */
function handle(request: Request): NextResponse {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: 'Bootstrap disabled (AUTH_SECRET unset).' }, { status: 404 });

  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (token !== secret) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      message: 'This endpoint is retired. Use reprovision then load-midwest.',
      reprovision: '/api/admin/reprovision?token=<AUTH_SECRET>&confirm=reset',
      loadMidwest: '/api/admin/load-midwest?token=<AUTH_SECRET>',
    },
    { status: 410 },
  );
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}
