import { describe, it, expect } from 'vitest';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_KEYS,
  isSubscribableEvent,
  sanitizeEventKeys,
  bookingEventToWebhookKey,
  webhookBackoffMs,
  shouldRetryWebhook,
  isDeliveryDue,
  WEBHOOK_MAX_ATTEMPTS,
  signaturePayload,
  formatSignatureHeader,
  isPrivateHostname,
  validateWebhookUrl,
} from './webhooks';

describe('event catalogue', () => {
  it('exposes six subscribable events', () => {
    expect(WEBHOOK_EVENTS).toHaveLength(6);
    expect(WEBHOOK_EVENT_KEYS).toContain('booking.confirmed');
  });

  it('validates subscribable keys', () => {
    expect(isSubscribableEvent('booking.created')).toBe(true);
    expect(isSubscribableEvent('ping')).toBe(false);
    expect(isSubscribableEvent('nope')).toBe(false);
  });

  it('sanitizes arbitrary input into valid, de-duplicated keys', () => {
    expect(sanitizeEventKeys(['booking.created', 'booking.created', 'x', 5, 'booking.completed'])).toEqual([
      'booking.created',
      'booking.completed',
    ]);
    expect(sanitizeEventKeys('nope')).toEqual([]);
  });

  it('maps internal booking events to public keys', () => {
    expect(bookingEventToWebhookKey('BOOKING_ACCEPTED')).toBe('booking.confirmed');
    expect(bookingEventToWebhookKey('BOOKING_CANCELLED')).toBe('booking.cancelled');
    expect(bookingEventToWebhookKey('BOOKING_REMINDER')).toBeNull();
  });
});

describe('delivery policy', () => {
  it('delivers immediately on the first attempt then backs off', () => {
    expect(webhookBackoffMs(0)).toBe(0);
    expect(webhookBackoffMs(1)).toBe(60_000);
    expect(webhookBackoffMs(2)).toBe(5 * 60_000);
    // Monotonic non-decreasing and capped.
    expect(webhookBackoffMs(99)).toBe(webhookBackoffMs(4));
  });

  it('retries until max attempts', () => {
    expect(shouldRetryWebhook(1)).toBe(true);
    expect(shouldRetryWebhook(WEBHOOK_MAX_ATTEMPTS)).toBe(false);
  });

  it('computes due-ness from attempts + last touch', () => {
    const now = new Date('2026-01-01T00:10:00Z');
    // 0 attempts → due immediately regardless of lastAttempt.
    expect(isDeliveryDue(0, new Date('2026-01-01T00:10:00Z'), now)).toBe(true);
    // 1 attempt needs 1 minute to pass.
    expect(isDeliveryDue(1, new Date('2026-01-01T00:09:30Z'), now)).toBe(false);
    expect(isDeliveryDue(1, new Date('2026-01-01T00:09:00Z'), now)).toBe(true);
  });
});

describe('signature contract', () => {
  it('binds the timestamp to the body', () => {
    expect(signaturePayload(1700000000, '{"a":1}')).toBe('1700000000.{"a":1}');
  });
  it('formats the header value', () => {
    expect(formatSignatureHeader(1700000000, 'abc123')).toBe('t=1700000000,v1=abc123');
  });
});

describe('SSRF host classification', () => {
  it('flags loopback, private and link-local hosts', () => {
    for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.5', '169.254.1.1', '::1', 'foo.internal']) {
      expect(isPrivateHostname(h)).toBe(true);
    }
  });
  it('treats public hosts as public', () => {
    for (const h of ['example.com', 'hooks.zapier.com', '8.8.8.8', '172.32.0.1']) {
      expect(isPrivateHostname(h)).toBe(false);
    }
  });
});

describe('validateWebhookUrl', () => {
  it('requires https for public endpoints', () => {
    expect(validateWebhookUrl('https://hooks.example.com/x').ok).toBe(true);
    expect(validateWebhookUrl('http://hooks.example.com/x').ok).toBe(false);
    expect(validateWebhookUrl('ftp://example.com').ok).toBe(false);
    expect(validateWebhookUrl('not a url').ok).toBe(false);
  });

  it('rejects private hosts unless explicitly allowed', () => {
    expect(validateWebhookUrl('https://127.0.0.1:9000/hook').ok).toBe(false);
    expect(validateWebhookUrl('http://127.0.0.1:9000/hook', { allowInsecure: true, allowPrivate: true }).ok).toBe(true);
  });
});
