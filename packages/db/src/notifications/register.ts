import { registerChannelProvider } from './provider';
import { emailProviderFromEnv, emailConfigStatus } from './smtp-provider';
import { logger } from '../logger';

/**
 * Wire concrete channel providers from the environment. Called once at server
 * startup (web `instrumentation.ts`). When SMTP is configured, the real
 * SmtpEmailProvider handles the EMAIL channel; otherwise the default no-op stays
 * in place so dev/demo runs need no mail setup.
 *
 * Returns whether a real email provider was registered (for logging/status).
 */
export function registerProvidersFromEnv(source: NodeJS.ProcessEnv = process.env): { email: boolean } {
  const provider = emailProviderFromEnv(source);
  if (provider) {
    registerChannelProvider('EMAIL', provider);
    const status = emailConfigStatus(source);
    logger.info('notification.email.provider.registered', {
      host: status.host,
      port: status.port,
      secure: status.secure,
      authenticated: status.authenticated,
      from: status.from,
    });
    return { email: true };
  }
  logger.info('notification.email.provider.noop', { reason: 'SMTP not configured (SMTP_HOST/EMAIL_FROM unset)' });
  return { email: false };
}
