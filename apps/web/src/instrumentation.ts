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

    // Wire notification channel providers (real SMTP email when configured,
    // otherwise the default no-op) once, at boot.
    const { registerProvidersFromEnv } = await import('@booking/db');
    const { email } = registerProvidersFromEnv();
    logger.info('Notification providers ready', { emailTransport: email ? 'smtp' : 'noop' });
  }
}
