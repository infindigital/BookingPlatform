import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Infrastructure health probe (Phase 1). Reports service liveness and which
 * subsystems are configured — no domain data, no DB access yet.
 */
export function GET() {
  logger.debug('Health check requested');

  return NextResponse.json({
    status: 'ok',
    service: 'booking-web',
    phase: 1,
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    checks: {
      env: 'ok',
      database: env.DATABASE_URL ? 'configured' : 'not-configured',
    },
  });
}
