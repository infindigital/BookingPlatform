/**
 * Outbound webhook domain (pure, UI- and transport-independent).
 *
 * The subscribable event catalogue, the mapping from the internal booking
 * lifecycle to stable public event keys, delivery backoff, URL / SSRF validation
 * and the exact bytes that get signed all live here so they are testable in
 * isolation. The actual HMAC and HTTP send live in the data layer (they need
 * Node's crypto / fetch); this module only produces the string to sign and the
 * header names, keeping the contract in one place.
 */

export type WebhookEventKey =
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.rejected'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.completed';

export interface WebhookEventMeta {
  key: WebhookEventKey;
  label: string;
  description: string;
}

/** The events a business can subscribe an endpoint to. Stable public API names. */
export const WEBHOOK_EVENTS: readonly WebhookEventMeta[] = [
  { key: 'booking.created', label: 'Booking created', description: 'A new booking was submitted.' },
  { key: 'booking.confirmed', label: 'Booking confirmed', description: 'A booking was approved / confirmed.' },
  { key: 'booking.rejected', label: 'Booking rejected', description: 'A booking request was declined.' },
  { key: 'booking.cancelled', label: 'Booking cancelled', description: 'A booking was cancelled.' },
  { key: 'booking.rescheduled', label: 'Booking rescheduled', description: 'A booking moved to a new time.' },
  { key: 'booking.completed', label: 'Booking completed', description: 'An appointment was marked complete.' },
];

export const WEBHOOK_EVENT_KEYS: readonly WebhookEventKey[] = WEBHOOK_EVENTS.map((e) => e.key);

/** A reserved event used only for the "send test event" ping - never subscribable. */
export const WEBHOOK_PING_EVENT = 'ping';

export function isSubscribableEvent(key: string): key is WebhookEventKey {
  return (WEBHOOK_EVENT_KEYS as readonly string[]).includes(key);
}

/** Keep only the valid, de-duplicated subscribable event keys from arbitrary input. */
export function sanitizeEventKeys(keys: unknown): WebhookEventKey[] {
  if (!Array.isArray(keys)) return [];
  const out = new Set<WebhookEventKey>();
  for (const k of keys) if (typeof k === 'string' && isSubscribableEvent(k)) out.add(k);
  return [...out];
}

/**
 * Map the internal notification/booking event enum (BOOKING_ACCEPTED, …) to the
 * public webhook key. Returns null for events with no public webhook (e.g.
 * reminders / follow-ups, which are notification-only).
 */
export function bookingEventToWebhookKey(event: string): WebhookEventKey | null {
  switch (event) {
    case 'BOOKING_CREATED':
      return 'booking.created';
    case 'BOOKING_ACCEPTED':
      return 'booking.confirmed';
    case 'BOOKING_REJECTED':
      return 'booking.rejected';
    case 'BOOKING_CANCELLED':
      return 'booking.cancelled';
    case 'BOOKING_RESCHEDULED':
      return 'booking.rescheduled';
    case 'BOOKING_COMPLETED':
      return 'booking.completed';
    default:
      return null;
  }
}

// --- Delivery policy ---------------------------------------------------------

export const WEBHOOK_MAX_ATTEMPTS = 5;

const MINUTE_MS = 60_000;

/**
 * Backoff before the delivery with the given number of attempts already made.
 * 0 attempts → 0 (deliver immediately on first pass), then 1m, 5m, 30m, 2h.
 */
export function webhookBackoffMs(attempts: number): number {
  const steps = [0, 1, 5, 30, 120]; // minutes, indexed by attempts already made
  const idx = Math.min(Math.max(attempts, 0), steps.length - 1);
  return steps[idx]! * MINUTE_MS;
}

/** Whether a delivery that just failed on its Nth attempt should be retried. */
export function shouldRetryWebhook(attempts: number, maxAttempts: number = WEBHOOK_MAX_ATTEMPTS): boolean {
  return attempts < maxAttempts;
}

/** Whether a PENDING delivery is due, given its attempts and when it was last touched. */
export function isDeliveryDue(attempts: number, lastAttemptAt: Date, now: Date = new Date()): boolean {
  return lastAttemptAt.getTime() + webhookBackoffMs(attempts) <= now.getTime();
}

// --- Signature contract ------------------------------------------------------

export const WEBHOOK_SIGNATURE_HEADER = 'X-Booking-Signature';
export const WEBHOOK_EVENT_HEADER = 'X-Booking-Event';
export const WEBHOOK_DELIVERY_HEADER = 'X-Booking-Delivery';
export const WEBHOOK_SIGNATURE_VERSION = 'v1';

/**
 * The exact string that gets HMAC-signed: `${timestamp}.${body}`. Including the
 * timestamp binds the signature to a moment so a receiver can reject replays.
 * The data layer computes HMAC-SHA256 over this and emits
 * `X-Booking-Signature: t=<timestamp>,v1=<hex>`.
 */
export function signaturePayload(timestampSeconds: number, body: string): string {
  return `${timestampSeconds}.${body}`;
}

/** Format the signature header value from a computed hex digest. */
export function formatSignatureHeader(timestampSeconds: number, hexDigest: string): string {
  return `t=${timestampSeconds},${WEBHOOK_SIGNATURE_VERSION}=${hexDigest}`;
}

// --- URL / SSRF validation ---------------------------------------------------

/** Hostnames that must never receive a webhook in production (SSRF guard). */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  // IPv6 loopback / unique-local / link-local.
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;

  // IPv4 dotted-quad ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true; // private / loopback / this-network
    if (a === 169 && b === 254) return true; // link-local
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

export interface UrlValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a webhook destination URL. Requires https (http allowed only when
 * `allowInsecure`, e.g. local dev/tests) and, unless `allowPrivate`, rejects
 * private / loopback hosts to blunt SSRF.
 */
export function validateWebhookUrl(
  raw: string,
  opts: { allowInsecure?: boolean; allowPrivate?: boolean } = {},
): UrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'Enter a valid absolute URL.' };
  }
  const scheme = url.protocol.replace(':', '');
  if (scheme !== 'https' && !(scheme === 'http' && opts.allowInsecure)) {
    return { ok: false, reason: 'The endpoint URL must use https://.' };
  }
  if (!opts.allowPrivate && isPrivateHostname(url.hostname)) {
    return { ok: false, reason: 'The endpoint host is not publicly reachable.' };
  }
  return { ok: true };
}
