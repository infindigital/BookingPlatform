import type { PrismaClient } from '@prisma/client';
import { isDeliveryDue, shouldRetryWebhook, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_PING_EVENT } from '@booking/core';
import { prisma } from '../client';
import { logger } from '../logger';
import { deliverWebhookRequest, type DeliveryOutcome } from './deliver';

/**
 * DB-backed webhook delivery dispatcher. No broker (cost policy): a due delivery
 * is a PENDING WebhookDelivery whose `updatedAt + backoff(attempts)` has passed.
 * Each is claimed with an optimistic guard (matching id + status + attempts, then
 * bumping attempts) so concurrent workers can't double-send with no lock server.
 * Delivery goes through the signed fetch; on non-2xx it retries with backoff up to
 * WEBHOOK_MAX_ATTEMPTS, then lands in FAILED. Driven by cron or the admin button.
 */

export interface WebhookProcessResult {
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  skipped: number;
}

function envelopeBody(deliveryId: string, requestBody: unknown, now: Date): string {
  const base = (requestBody && typeof requestBody === 'object' ? requestBody : {}) as Record<string, unknown>;
  return JSON.stringify({ id: deliveryId, createdAt: now.toISOString(), ...base });
}

async function recordOutcome(
  db: PrismaClient,
  id: string,
  attempts: number,
  outcome: DeliveryOutcome,
  result: WebhookProcessResult,
): Promise<void> {
  const responseBody = outcome.responseBody ?? outcome.error ?? null;
  if (outcome.ok) {
    await db.webhookDelivery.update({
      where: { id },
      data: { status: 'SUCCESS', statusCode: outcome.statusCode, responseBody },
    });
    result.delivered += 1;
    return;
  }
  const retry = shouldRetryWebhook(attempts, WEBHOOK_MAX_ATTEMPTS);
  await db.webhookDelivery.update({
    where: { id },
    // Staying PENDING bumps updatedAt, which reschedules the next attempt via backoff.
    data: { status: retry ? 'PENDING' : 'FAILED', statusCode: outcome.statusCode, responseBody },
  });
  if (retry) result.retried += 1;
  else result.failed += 1;
}

export async function processWebhookDeliveries(
  opts: { limit?: number; now?: Date; businessId?: string } = {},
  db: PrismaClient = prisma,
): Promise<WebhookProcessResult> {
  const now = opts.now ?? new Date();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const result: WebhookProcessResult = { claimed: 0, delivered: 0, retried: 0, failed: 0, skipped: 0 };

  const candidates = await db.webhookDelivery.findMany({
    where: { status: 'PENDING', ...(opts.businessId ? { businessId: opts.businessId } : {}) },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    include: { webhook: { select: { url: true, secret: true, isActive: true } } },
  });

  for (const d of candidates) {
    if (!isDeliveryDue(d.attempts, d.updatedAt, now)) continue;

    // Inactive endpoint: stop trying (it will never deliver).
    if (!d.webhook || !d.webhook.isActive) {
      const claim = await db.webhookDelivery.updateMany({
        where: { id: d.id, status: 'PENDING', attempts: d.attempts },
        data: { status: 'FAILED', responseBody: 'Endpoint is inactive.' },
      });
      if (claim.count > 0) result.failed += 1;
      continue;
    }

    // Optimistic claim: bump attempts; only the worker that wins proceeds.
    const attempt = d.attempts + 1;
    const claim = await db.webhookDelivery.updateMany({
      where: { id: d.id, status: 'PENDING', attempts: d.attempts },
      data: { attempts: attempt },
    });
    if (claim.count === 0) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    const body = envelopeBody(d.id, d.requestBody, now);
    const outcome = await deliverWebhookRequest({
      url: d.webhook.url,
      secret: d.webhook.secret,
      event: d.event,
      deliveryId: d.id,
      body,
      now,
    });
    await recordOutcome(db, d.id, attempt, outcome, result);
  }

  if (result.claimed > 0 || result.failed > 0) logger.info('webhook.dispatch.pass', { ...result });
  return result;
}

/**
 * Deliver a one-off `ping` to a single endpoint immediately (admin "Send test
 * event"). Records a WebhookDelivery so it shows in the activity log. Returns the
 * outcome for instant UI feedback.
 */
export async function sendWebhookPing(
  businessId: string,
  webhookId: string,
  db: PrismaClient = prisma,
): Promise<{ ok: boolean; statusCode: number | null; error: string | null } | null> {
  const webhook = await db.webhook.findFirst({ where: { id: webhookId, businessId } });
  if (!webhook) return null;

  const now = new Date();
  const delivery = await db.webhookDelivery.create({
    data: {
      businessId,
      webhookId,
      event: WEBHOOK_PING_EVENT,
      status: 'PENDING',
      attempts: 1,
      requestBody: { event: WEBHOOK_PING_EVENT, businessId, data: { message: 'This is a test event.' } } as object,
    },
  });

  const body = envelopeBody(delivery.id, delivery.requestBody, now);
  const outcome = await deliverWebhookRequest({
    url: webhook.url,
    secret: webhook.secret,
    event: WEBHOOK_PING_EVENT,
    deliveryId: delivery.id,
    body,
    now,
  });
  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: outcome.ok ? 'SUCCESS' : 'FAILED', statusCode: outcome.statusCode, responseBody: outcome.responseBody ?? outcome.error ?? null },
  });
  return { ok: outcome.ok, statusCode: outcome.statusCode, error: outcome.error };
}

/** Re-arm a FAILED delivery for another full round of attempts (admin "Retry"). */
export async function retryWebhookDelivery(businessId: string, deliveryId: string, db: PrismaClient = prisma): Promise<boolean> {
  const res = await db.webhookDelivery.updateMany({
    where: { id: deliveryId, businessId, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, responseBody: null, statusCode: null },
  });
  return res.count > 0;
}
