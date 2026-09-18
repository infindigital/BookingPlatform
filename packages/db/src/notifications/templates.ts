import type { NotificationChannel, NotificationEvent, PrismaClient } from '@prisma/client';
import {
  NOTIFICATION_EVENTS,
  defaultTemplate,
  type NotificationEventKey,
} from '@booking/core';
import { prisma } from '../client';

/**
 * Admin-facing template configuration. Each business/event/channel row is
 * editable; when a row is missing the default copy from core is surfaced so the
 * editor always has something to show and the dispatcher always has a template.
 */

export interface NotificationTemplateConfig {
  event: NotificationEvent;
  label: string;
  description: string;
  immediate: boolean;
  channel: NotificationChannel;
  subject: string;
  body: string;
  isActive: boolean;
  /** True when a stored row exists (i.e. the copy has been customised). */
  isCustom: boolean;
}

export async function getNotificationTemplates(
  businessId: string,
  db: PrismaClient = prisma,
  channel: NotificationChannel = 'EMAIL',
): Promise<NotificationTemplateConfig[]> {
  const rows = await db.notificationTemplate.findMany({ where: { businessId, channel } });
  const byEvent = new Map(rows.map((r) => [r.event, r] as const));

  return NOTIFICATION_EVENTS.map((meta) => {
    const row = byEvent.get(meta.event);
    const def = defaultTemplate(meta.event as NotificationEventKey);
    return {
      event: meta.event as NotificationEvent,
      label: meta.label,
      description: meta.description,
      immediate: meta.immediate,
      channel,
      subject: row?.subject ?? def.subject,
      body: row?.body ?? def.body,
      isActive: row ? row.isActive : true,
      isCustom: !!row,
    };
  });
}

export async function saveNotificationTemplate(
  businessId: string,
  input: { event: NotificationEvent; channel?: NotificationChannel; subject: string; body: string; isActive: boolean },
  db: PrismaClient = prisma,
): Promise<void> {
  const channel = input.channel ?? 'EMAIL';
  await db.notificationTemplate.upsert({
    where: { businessId_event_channel: { businessId, event: input.event, channel } },
    update: { subject: input.subject, body: input.body, isActive: input.isActive },
    create: { businessId, event: input.event, channel, subject: input.subject, body: input.body, isActive: input.isActive },
  });
}

/** Restore an event's template to the built-in default copy (active). */
export async function resetNotificationTemplate(
  businessId: string,
  event: NotificationEvent,
  channel: NotificationChannel = 'EMAIL',
  db: PrismaClient = prisma,
): Promise<void> {
  const def = defaultTemplate(event as NotificationEventKey);
  await db.notificationTemplate.upsert({
    where: { businessId_event_channel: { businessId, event, channel } },
    update: { subject: def.subject, body: def.body, isActive: true },
    create: { businessId, event, channel, subject: def.subject, body: def.body, isActive: true },
  });
}
