import { NextResponse } from 'next/server';
import { processDueNotifications } from '@booking/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron entry point for draining the DB-backed notification queue.
 *
 * This is the operational counterpart to the admin "Process queue" button: an
 * external scheduler (cron, GitHub Action, uptime pinger - no Redis or hosted
 * worker required) POSTs here on an interval. It is gated by a shared secret;
 * when NOTIFICATIONS_CRON_SECRET is unset the endpoint is disabled entirely, so
 * it is never anonymously invokable.
 */
async function handle(request: Request): Promise<NextResponse> {
  const secret = env.NOTIFICATIONS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : request.headers.get('x-cron-secret') ?? '';
  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await processDueNotifications({ limit: 200 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logger.error('Notification cron failed', { message: (error as Error)?.message });
    return NextResponse.json({ ok: false, error: 'Processing failed' }, { status: 500 });
  }
}

export function POST(request: Request) {
  return handle(request);
}
