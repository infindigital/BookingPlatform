import { NextResponse } from 'next/server';
import { processWebhookDeliveries } from '@booking/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron entry point for draining the DB-backed webhook delivery queue - the
 * operational counterpart to the admin "Process deliveries" button. An external
 * scheduler POSTs here on an interval (no Redis / hosted worker). Gated by a
 * shared secret; disabled (404) when WEBHOOKS_CRON_SECRET is unset.
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = env.WEBHOOKS_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : request.headers.get('x-cron-secret') ?? '';
  if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const summary = await processWebhookDeliveries({ limit: 200 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error('Webhook cron failed', { message: (error as Error)?.message });
    return NextResponse.json({ ok: false, error: 'Processing failed' }, { status: 500 });
  }
}

export function POST(request: Request) {
  return handle(request);
}
