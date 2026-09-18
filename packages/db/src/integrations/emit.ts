import type { PrismaClient } from '@prisma/client';
import { bookingEventToWebhookKey, sanitizeEventKeys, type WebhookEventKey } from '@booking/core';
import { prisma } from '../client';
import { logger } from '../logger';
import { buildBookingWebhookData } from './payload';

/**
 * Fan a booking lifecycle event out to the tenant's subscribed webhook endpoints
 * by creating one PENDING WebhookDelivery per matching active webhook. The
 * dispatcher (dispatch.ts) drains and signs them separately.
 *
 * Like notification enqueue, this is BEST-EFFORT: a webhook problem must never
 * break the booking mutation that triggered it, so everything is caught + logged.
 * The request body snapshot is stored on the delivery so a retry re-sends the
 * exact same bytes even if the booking later changes.
 */

async function activeWebhooksForEvent(businessId: string, event: WebhookEventKey, db: PrismaClient) {
  const rows = await db.webhook.findMany({
    where: { businessId, isActive: true },
    select: { id: true, events: true },
  });
  return rows.filter((w) => sanitizeEventKeys(w.events).includes(event));
}

/** Enqueue deliveries for an internal booking event (mapped to its public key). */
export async function emitBookingWebhook(
  businessId: string,
  bookingId: string,
  internalEvent: string,
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    const event = bookingEventToWebhookKey(internalEvent);
    if (!event) return; // notification-only event (reminder/follow-up) - no public webhook

    const targets = await activeWebhooksForEvent(businessId, event, db);
    if (targets.length === 0) return;

    const data = await buildBookingWebhookData(businessId, bookingId, db);
    if (!data) return;

    // requestBody holds the event + data; the delivery id and envelope wrapper are
    // finalised by the dispatcher (which knows the delivery's own id).
    const requestBody = { event, businessId, data: { booking: data } };
    await db.webhookDelivery.createMany({
      data: targets.map((w) => ({
        businessId,
        webhookId: w.id,
        event,
        status: 'PENDING' as const,
        requestBody: requestBody as object,
      })),
    });
  } catch (error) {
    logger.error('webhook.emit.failed', { internalEvent, bookingId, message: (error as Error)?.message });
  }
}
