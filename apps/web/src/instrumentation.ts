/**
 * Next.js startup hook — runs once when the server boots.
 * Validates environment variables early so a misconfigured deployment fails fast.
 */
export async function register(): Promise<void> {
  // Only run on the Node.js server runtime (skip edge).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { env } = await import('@/lib/env');
    const { logger } = await import('@/lib/logger');
    logger.info('Environment validated', {
      nodeEnv: env.NODE_ENV,
      appUrl: env.APP_URL,
      databaseConfigured: Boolean(env.DATABASE_URL),
    });
  }
}
