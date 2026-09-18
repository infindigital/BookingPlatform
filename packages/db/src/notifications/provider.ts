import type { NotificationChannel } from '@prisma/client';

/**
 * Channel transport seam.
 *
 * The notification engine (queue, retries, logging, templating) is real and
 * fully exercised; only the final hop to an external provider is abstracted here
 * so a concrete EMAIL/SMS/WhatsApp integration can be dropped in during the
 * Email/Integrations phases without touching the dispatcher.
 *
 * The default provider is a no-op that "accepts" the message and returns a
 * synthetic id - it never contacts a third party (honouring the cost policy: no
 * mandatory paid service), and it lets the whole pipeline be tested end to end.
 */

export interface NotificationMessage {
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  /** Optional rich (HTML) alternative - set by the dispatcher for the EMAIL channel. */
  html?: string | null;
  event: string;
  bookingId: string | null;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface ChannelProvider {
  send(message: NotificationMessage): Promise<SendResult>;
}

/** No-op provider: records nothing externally, always accepts. */
export class NoopProvider implements ChannelProvider {
  async send(message: NotificationMessage): Promise<SendResult> {
    if (!message.recipient) return { ok: false, error: 'No recipient address on file.' };
    return { ok: true, providerMessageId: `noop_${Math.random().toString(36).slice(2, 12)}` };
  }
}

const registry = new Map<NotificationChannel, ChannelProvider>();
const fallback = new NoopProvider();

/** Register a concrete provider for a channel (used by later phases / tests). */
export function registerChannelProvider(channel: NotificationChannel, provider: ChannelProvider): void {
  registry.set(channel, provider);
}

/** Reset all providers to the default no-op (used by tests). */
export function resetChannelProviders(): void {
  registry.clear();
}

export function getChannelProvider(channel: NotificationChannel): ChannelProvider {
  return registry.get(channel) ?? fallback;
}
