import {
  validateWebhookUrl,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_DELIVERY_HEADER,
} from '@booking/core';
import { signatureHeaderValue } from './signing';

/**
 * The one place that actually performs an outbound HTTP request. Uses the
 * built-in fetch (no dependency), a hard timeout, and re-checks the SSRF policy
 * at send time (URLs are validated on save too, but hosts can change). Never
 * throws for an HTTP error - it returns a structured result the dispatcher logs.
 */

export interface DeliveryOutcome {
  ok: boolean;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
}

/** Whether http:// and private hosts are permitted (dev/test only, never in production). */
export function deliveryPolicy(env: NodeJS.ProcessEnv = process.env): { allowInsecure: boolean; allowPrivate: boolean } {
  if (env.WEBHOOKS_ALLOW_INSECURE === 'true') return { allowInsecure: true, allowPrivate: true };
  const isProd = env.NODE_ENV === 'production';
  return { allowInsecure: !isProd, allowPrivate: !isProd };
}

const MAX_RESPONSE_CHARS = 2000;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function deliverWebhookRequest(args: {
  url: string;
  secret: string;
  event: string;
  deliveryId: string;
  body: string;
  timeoutMs?: number;
  now?: Date;
}): Promise<DeliveryOutcome> {
  const policy = deliveryPolicy();
  const valid = validateWebhookUrl(args.url, policy);
  if (!valid.ok) return { ok: false, statusCode: null, responseBody: null, error: valid.reason ?? 'Invalid endpoint URL.' };

  const timestamp = Math.floor((args.now ?? new Date()).getTime() / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(args.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'BookingPlatform-Webhooks/1.0',
        [WEBHOOK_EVENT_HEADER]: args.event,
        [WEBHOOK_DELIVERY_HEADER]: args.deliveryId,
        [WEBHOOK_SIGNATURE_HEADER]: signatureHeaderValue(args.secret, timestamp, args.body),
      },
      body: args.body,
      signal: controller.signal,
      redirect: 'manual', // don't follow redirects to a possibly-internal target
    });
    let text = '';
    try {
      text = (await res.text()).slice(0, MAX_RESPONSE_CHARS);
    } catch {
      // ignore body read failures
    }
    // 2xx is success; everything else (incl. 3xx) is a delivery failure.
    const ok = res.status >= 200 && res.status < 300;
    return { ok, statusCode: res.status, responseBody: text || null, error: ok ? null : `Endpoint returned ${res.status}.` };
  } catch (error) {
    const err = error as Error;
    const msg = err?.name === 'AbortError' ? 'Request timed out.' : err?.message ?? 'Request failed.';
    return { ok: false, statusCode: null, responseBody: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
