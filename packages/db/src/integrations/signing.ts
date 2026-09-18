import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { signaturePayload, formatSignatureHeader } from '@booking/core';

/**
 * Webhook secret + HMAC signing (data layer — needs Node crypto).
 *
 * Each webhook has a shared secret (stored server-side). Deliveries are signed
 * HMAC-SHA256 over `${timestamp}.${body}` (the exact string is defined in core),
 * emitted as `X-Booking-Signature: t=<ts>,v1=<hex>`. A receiver recomputes the
 * same HMAC with their copy of the secret to verify authenticity and integrity,
 * and can reject an old timestamp to prevent replay.
 */

/** Generate a new webhook signing secret (prefixed, URL-safe hex). */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/** HMAC-SHA256 hex digest of the signed payload for a secret. */
export function computeSignature(secret: string, timestampSeconds: number, body: string): string {
  return createHmac('sha256', secret).update(signaturePayload(timestampSeconds, body)).digest('hex');
}

/** Full `X-Booking-Signature` header value for a delivery. */
export function signatureHeaderValue(secret: string, timestampSeconds: number, body: string): string {
  return formatSignatureHeader(timestampSeconds, computeSignature(secret, timestampSeconds, body));
}

/**
 * Verify a signature header value against the body + secret in constant time.
 * Exposed so the platform's own receivers (and tests) can validate deliveries.
 */
export function verifySignature(secret: string, headerValue: string, body: string, toleranceSeconds = 300, now = new Date()): boolean {
  const parts = Object.fromEntries(
    headerValue
      .split(',')
      .map((kv) => kv.trim().split('='))
      .filter((p) => p.length === 2) as [string, string][],
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - t) > toleranceSeconds) return false;

  const expected = computeSignature(secret, t, body);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
