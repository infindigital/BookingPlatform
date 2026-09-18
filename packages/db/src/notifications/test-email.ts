import { renderBrandedEmail, renderEmailText } from '@booking/core';
import { getChannelProvider } from './provider';
import type { SendResult } from './provider';

/**
 * Send a one-off test email through whichever EMAIL provider is registered (real
 * SMTP when configured, otherwise the no-op). Lets an admin confirm delivery from
 * the settings UI without creating a booking. Returns the provider's SendResult.
 */
export async function sendTestEmail(to: string, businessName: string): Promise<SendResult> {
  const name = businessName || 'Booking';
  const bodyText =
    `Hi,\n\nThis is a test email from ${name}. ` +
    `If it landed in your inbox, your booking notifications are configured correctly and customers will receive their confirmations and reminders.\n\n${name}`;
  const html = renderBrandedEmail({ businessName: name, bodyText });
  const provider = getChannelProvider('EMAIL');
  return provider.send({
    channel: 'EMAIL',
    recipient: to,
    subject: `Test email from ${name}`,
    body: renderEmailText({ bodyText }),
    html,
    event: 'TEST',
    bookingId: null,
  });
}
