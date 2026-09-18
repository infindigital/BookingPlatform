import type { PrismaClient, WebhookDeliveryStatus } from '@prisma/client';
import { sanitizeEventKeys } from '@booking/core';
import { prisma } from '../client';

/**
 * Read models for the admin Integrations UI. Tenant-scoped; never expose the
 * signing secret in a list (it is returned only once, on create / rotate).
 */

export interface WebhookListItem {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  deliveries: { total: number; success: number; failed: number; pending: number };
  lastDeliveryAt: string | null;
  lastStatus: WebhookDeliveryStatus | null;
}

export interface WebhookDeliveryRow {
  id: string;
  webhookId: string;
  event: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  attempts: number;
  responseBody: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getWebhookList(businessId: string, db: PrismaClient = prisma): Promise<WebhookListItem[]> {
  const hooks = await db.webhook.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } });
  if (hooks.length === 0) return [];

  const ids = hooks.map((h) => h.id);
  const grouped = await db.webhookDelivery.groupBy({
    by: ['webhookId', 'status'],
    where: { businessId, webhookId: { in: ids } },
    _count: { _all: true },
  });
  const latest = await db.webhookDelivery.findMany({
    where: { businessId, webhookId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    distinct: ['webhookId'],
    select: { webhookId: true, status: true, createdAt: true },
  });
  const lastByHook = new Map(latest.map((l) => [l.webhookId, l]));

  return hooks.map((h) => {
    const counts = { total: 0, success: 0, failed: 0, pending: 0 };
    for (const g of grouped) {
      if (g.webhookId !== h.id) continue;
      const n = g._count._all;
      counts.total += n;
      if (g.status === 'SUCCESS') counts.success += n;
      else if (g.status === 'FAILED') counts.failed += n;
      else if (g.status === 'PENDING') counts.pending += n;
    }
    const last = lastByHook.get(h.id);
    return {
      id: h.id,
      url: h.url,
      events: sanitizeEventKeys(h.events),
      isActive: h.isActive,
      createdAt: h.createdAt.toISOString(),
      deliveries: counts,
      lastDeliveryAt: last ? last.createdAt.toISOString() : null,
      lastStatus: last ? last.status : null,
    };
  });
}

export async function getWebhookDeliveries(
  businessId: string,
  opts: { webhookId?: string; limit?: number } = {},
  db: PrismaClient = prisma,
): Promise<WebhookDeliveryRow[]> {
  const rows = await db.webhookDelivery.findMany({
    where: { businessId, ...(opts.webhookId ? { webhookId: opts.webhookId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, opts.limit ?? 50)),
    select: {
      id: true,
      webhookId: true,
      event: true,
      status: true,
      statusCode: true,
      attempts: true,
      responseBody: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    webhookId: r.webhookId,
    event: r.event,
    status: r.status,
    statusCode: r.statusCode,
    attempts: r.attempts,
    responseBody: r.responseBody,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
