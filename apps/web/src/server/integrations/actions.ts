'use server';

import { revalidatePath } from 'next/cache';
import {
  repositoriesFor,
  getWebhookList,
  getWebhookDeliveries,
  sendWebhookPing,
  processWebhookDeliveries,
  retryWebhookDelivery,
  deliveryPolicy,
  writeAudit,
  type WebhookListItem,
  type WebhookDeliveryRow,
  type WebhookProcessResult,
} from '@booking/db';
import { validateWebhookUrl, sanitizeEventKeys } from '@booking/core';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface WebhookActionResult {
  ok: boolean;
  error?: string;
  /** Returned only on create / rotate — the plaintext secret is shown once. */
  secret?: string;
}

function refresh(): void {
  revalidatePath('/admin/integrations');
}

export async function loadWebhooks(): Promise<WebhookListItem[]> {
  const session = await requirePermission('settings.manage');
  return getWebhookList(session.user.businessId);
}

export async function loadWebhookDeliveries(webhookId?: string): Promise<WebhookDeliveryRow[]> {
  const session = await requirePermission('settings.manage');
  return getWebhookDeliveries(session.user.businessId, { webhookId, limit: 60 });
}

function validate(url: string, events: string[]): { url: string; events: string[] } | { error: string } {
  const trimmed = url.trim();
  const check = validateWebhookUrl(trimmed, deliveryPolicy());
  if (!check.ok) return { error: check.reason ?? 'Invalid endpoint URL.' };
  const clean = sanitizeEventKeys(events);
  if (clean.length === 0) return { error: 'Select at least one event to subscribe to.' };
  return { url: trimmed, events: clean };
}

export async function createWebhookAction(input: { url: string; events: string[] }): Promise<WebhookActionResult> {
  const session = await requirePermission('settings.manage');
  const v = validate(input.url, input.events);
  if ('error' in v) return { ok: false, error: v.error };
  try {
    const repos = repositoriesFor(session.user.businessId);
    const hook = await repos.webhooks.create({ url: v.url, events: v.events });
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.create', entity: 'Webhook', entityId: hook.id });
    refresh();
    return { ok: true, secret: hook.secret };
  } catch (error) {
    logger.error('webhook.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the webhook.' };
  }
}

export async function updateWebhookAction(input: { id: string; url: string; events: string[]; isActive: boolean }): Promise<WebhookActionResult> {
  const session = await requirePermission('settings.manage');
  const v = validate(input.url, input.events);
  if ('error' in v) return { ok: false, error: v.error };
  try {
    const repos = repositoriesFor(session.user.businessId);
    const ok = await repos.webhooks.update(input.id, { url: v.url, events: v.events, isActive: input.isActive });
    if (!ok) return { ok: false, error: 'Webhook not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.update', entity: 'Webhook', entityId: input.id });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('webhook.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not update the webhook.' };
  }
}

export async function toggleWebhookAction(input: { id: string; isActive: boolean }): Promise<WebhookActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const ok = await repos.webhooks.setActive(input.id, input.isActive);
    if (!ok) return { ok: false, error: 'Webhook not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.toggle', entity: 'Webhook', entityId: input.id, metadata: { isActive: input.isActive } });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('webhook.toggle.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not update the webhook.' };
  }
}

export async function rotateWebhookSecretAction(input: { id: string }): Promise<WebhookActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const secret = await repos.webhooks.rotateSecret(input.id);
    if (!secret) return { ok: false, error: 'Webhook not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.rotate_secret', entity: 'Webhook', entityId: input.id });
    refresh();
    return { ok: true, secret };
  } catch (error) {
    logger.error('webhook.rotate.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not rotate the secret.' };
  }
}

export async function deleteWebhookAction(input: { id: string }): Promise<WebhookActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const repos = repositoriesFor(session.user.businessId);
    const ok = await repos.webhooks.remove(input.id);
    if (!ok) return { ok: false, error: 'Webhook not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.delete', entity: 'Webhook', entityId: input.id });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('webhook.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the webhook.' };
  }
}

export async function sendWebhookPingAction(input: { id: string }): Promise<WebhookActionResult & { statusCode?: number | null }> {
  const session = await requirePermission('settings.manage');
  try {
    const out = await sendWebhookPing(session.user.businessId, input.id);
    if (!out) return { ok: false, error: 'Webhook not found.' };
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.ping', entity: 'Webhook', entityId: input.id, metadata: { ok: out.ok, statusCode: out.statusCode } });
    refresh();
    return out.ok ? { ok: true, statusCode: out.statusCode } : { ok: false, error: out.error ?? 'The endpoint did not accept the ping.', statusCode: out.statusCode };
  } catch (error) {
    logger.error('webhook.ping.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not send the test event.' };
  }
}

export async function retryWebhookDeliveryAction(input: { id: string }): Promise<WebhookActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    const ok = await retryWebhookDelivery(session.user.businessId, input.id);
    if (!ok) return { ok: false, error: 'Only failed deliveries can be retried.' };
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('webhook.retry.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not retry the delivery.' };
  }
}

export async function processWebhooksAction(): Promise<WebhookActionResult & { summary?: WebhookProcessResult }> {
  const session = await requirePermission('settings.manage');
  try {
    const summary = await processWebhookDeliveries({ businessId: session.user.businessId, limit: 100 });
    await writeAudit({ businessId: session.user.businessId, actorUserId: session.user.id, action: 'webhook.process', entity: 'WebhookDelivery', metadata: { ...summary } });
    refresh();
    return { ok: true, summary };
  } catch (error) {
    logger.error('webhook.process.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not process deliveries.' };
  }
}
