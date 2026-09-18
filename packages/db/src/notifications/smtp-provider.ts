import type { ChannelProvider, NotificationMessage, SendResult } from './provider';
import { sendSmtpMail, type SmtpConfig } from './smtp-client';

/**
 * Concrete EMAIL transport: delivers a NotificationMessage over SMTP using the
 * dependency-free client. This is the real provider a client deployment registers
 * (via env) in place of the default no-op. Any SMTP mailbox works — the client's
 * Hostinger email, a Google Workspace account, a self-hosted Postfix — so there is
 * no mandatory paid service (cost policy).
 */

export interface EmailIdentity {
  /** Envelope + From address, e.g. bookings@business.com. */
  from: string;
  fromName?: string;
  replyTo?: string;
}

export class SmtpEmailProvider implements ChannelProvider {
  constructor(
    private readonly config: SmtpConfig,
    private readonly identity: EmailIdentity,
  ) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    if (!message.recipient) return { ok: false, error: 'No recipient email address on file.' };
    try {
      const res = await sendSmtpMail(this.config, {
        from: this.identity.from,
        fromName: this.identity.fromName,
        replyTo: this.identity.replyTo,
        to: message.recipient,
        subject: message.subject ?? '',
        text: message.body,
        html: message.html ?? null,
      });
      return { ok: true, providerMessageId: res.messageId };
    } catch (error) {
      return { ok: false, error: (error as Error)?.message ?? 'SMTP send failed.' };
    }
  }
}

/** A trimmed view of the email configuration for status display (never exposes the password). */
export interface EmailConfigStatus {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  from?: string;
  fromName?: string;
  authenticated?: boolean;
}

/**
 * Read SMTP configuration from the environment. Returns null when email is not
 * configured, so the caller keeps the no-op provider (dev/demo still works with no
 * setup). Credentials stay server-side and are never returned to a client.
 *
 * Recognised vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false" — implicit TLS),
 *   SMTP_USER, SMTP_PASS, SMTP_TLS_REJECT_UNAUTHORIZED,
 *   EMAIL_FROM (required), EMAIL_FROM_NAME, EMAIL_REPLY_TO.
 */
export function emailConfigFromEnv(
  source: NodeJS.ProcessEnv = process.env,
): { config: SmtpConfig; identity: EmailIdentity } | null {
  const host = source.SMTP_HOST?.trim();
  const from = source.EMAIL_FROM?.trim();
  if (!host || !from) return null;

  const port = Number(source.SMTP_PORT) || 587;
  // Implicit TLS defaults on for port 465; STARTTLS otherwise. SMTP_SECURE overrides.
  const secure = source.SMTP_SECURE ? source.SMTP_SECURE.trim().toLowerCase() === 'true' : port === 465;

  const config: SmtpConfig = {
    host,
    port,
    secure,
    user: source.SMTP_USER?.trim() || undefined,
    pass: source.SMTP_PASS || undefined,
    rejectUnauthorized: source.SMTP_TLS_REJECT_UNAUTHORIZED
      ? source.SMTP_TLS_REJECT_UNAUTHORIZED.trim().toLowerCase() !== 'false'
      : true,
  };
  const identity: EmailIdentity = {
    from,
    fromName: source.EMAIL_FROM_NAME?.trim() || undefined,
    replyTo: source.EMAIL_REPLY_TO?.trim() || undefined,
  };
  return { config, identity };
}

/** Build the EMAIL provider from env, or null when email is not configured. */
export function emailProviderFromEnv(source: NodeJS.ProcessEnv = process.env): SmtpEmailProvider | null {
  const resolved = emailConfigFromEnv(source);
  return resolved ? new SmtpEmailProvider(resolved.config, resolved.identity) : null;
}

/** Non-secret status for the admin UI. */
export function emailConfigStatus(source: NodeJS.ProcessEnv = process.env): EmailConfigStatus {
  const resolved = emailConfigFromEnv(source);
  if (!resolved) return { configured: false };
  return {
    configured: true,
    host: resolved.config.host,
    port: resolved.config.port,
    secure: resolved.config.secure,
    from: resolved.identity.from,
    fromName: resolved.identity.fromName,
    authenticated: Boolean(resolved.config.user),
  };
}
