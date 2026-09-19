import type { ChannelProvider, NotificationMessage, SendResult } from './provider';
import type { SmsCredentials } from '../settings/settings.repository';
import { logger } from '../logger';

/**
 * Twilio SMS provider. Dependency-free: a single HTTPS POST to Twilio's REST API
 * (form-encoded, HTTP Basic auth with Account SID + auth token). Credentials are
 * resolved per business at send time (decrypted from the DB), so this provider is
 * constructed with them rather than registered globally.
 *
 * SMS has no rich alternative - only the plain `body` is sent; `subject`/`html`
 * are ignored.
 */
class TwilioSmsProvider implements ChannelProvider {
  constructor(private readonly creds: SmsCredentials) {}

  async send(message: NotificationMessage): Promise<SendResult> {
    const to = message.recipient?.trim();
    if (!to) return { ok: false, error: 'No phone number on file for this recipient.' };

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.creds.accountSid)}/Messages.json`;
    const auth = Buffer.from(`${this.creds.accountSid}:${this.creds.authToken}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: this.creds.fromNumber, Body: message.body });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const data = (await res.json().catch(() => null)) as { sid?: string; message?: string; code?: number } | null;
      if (res.ok && data?.sid) {
        return { ok: true, providerMessageId: data.sid };
      }
      const error = data?.message ? `Twilio: ${data.message}` : `Twilio request failed (${res.status}).`;
      return { ok: false, error };
    } catch (error) {
      logger.error('sms.twilio.send.failed', { message: (error as Error)?.message });
      return { ok: false, error: 'Could not reach the SMS provider.' };
    }
  }
}

/** Build an SMS provider bound to a business's decrypted Twilio credentials. */
export function twilioProviderFromCredentials(creds: SmsCredentials): ChannelProvider {
  return new TwilioSmsProvider(creds);
}
