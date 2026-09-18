'use server';

import { revalidatePath } from 'next/cache';
import {
  getNotificationTemplates,
  saveNotificationTemplate,
  resetNotificationTemplate,
  getNotificationActivity,
  processDueNotifications,
  emailConfigStatus,
  sendTestEmail,
  businessRepository,
  writeAudit,
  type NotificationTemplateConfig,
  type NotificationActivity,
  type NotificationEvent,
  type EmailConfigStatus,
  type ProcessResult,
} from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface NotificationActionResult {
  ok: boolean;
  error?: string;
}

const VALID_EVENTS = new Set<NotificationEvent>([
  'BOOKING_CREATED',
  'BOOKING_ACCEPTED',
  'BOOKING_REJECTED',
  'BOOKING_CANCELLED',
  'BOOKING_RESCHEDULED',
  'BOOKING_COMPLETED',
  'BOOKING_REMINDER',
  'BOOKING_FOLLOW_UP',
]);

function refresh(): void {
  revalidatePath('/admin/notifications');
}

export async function loadNotificationTemplates(): Promise<NotificationTemplateConfig[]> {
  const session = await requirePermission('settings.manage');
  return getNotificationTemplates(session.user.businessId);
}

export async function loadNotificationActivity(): Promise<NotificationActivity> {
  const session = await requirePermission('settings.manage');
  return getNotificationActivity(session.user.businessId, { limit: 60 });
}

export async function saveNotificationTemplateAction(input: {
  event: NotificationEvent;
  subject: string;
  body: string;
  isActive: boolean;
}): Promise<NotificationActionResult> {
  const session = await requirePermission('settings.manage');
  if (!VALID_EVENTS.has(input.event)) return { ok: false, error: 'Unknown notification event.' };
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'The message body cannot be empty.' };

  try {
    await saveNotificationTemplate(session.user.businessId, { event: input.event, subject, body, isActive: input.isActive });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.template.save',
      entity: 'NotificationTemplate',
      entityId: input.event,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('notification.template.save.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the template. Please try again.' };
  }
}

export async function resetNotificationTemplateAction(input: {
  event: NotificationEvent;
}): Promise<NotificationActionResult> {
  const session = await requirePermission('settings.manage');
  if (!VALID_EVENTS.has(input.event)) return { ok: false, error: 'Unknown notification event.' };
  try {
    await resetNotificationTemplate(session.user.businessId, input.event);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.template.reset',
      entity: 'NotificationTemplate',
      entityId: input.event,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('notification.template.reset.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not reset the template. Please try again.' };
  }
}

/** Non-secret email delivery status for the settings card (never returns the password). */
export async function loadEmailStatus(): Promise<EmailConfigStatus> {
  await requirePermission('settings.manage');
  return emailConfigStatus();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send a test email to a chosen address through the configured provider. */
export async function sendTestEmailAction(input: { to: string }): Promise<
  NotificationActionResult & { simulated?: boolean }
> {
  const session = await requirePermission('settings.manage');
  const to = input.to.trim();
  if (!EMAIL_RE.test(to)) return { ok: false, error: 'Enter a valid email address.' };

  const status = emailConfigStatus();
  try {
    const business = await businessRepository.getById(session.user.businessId);
    const result = await sendTestEmail(to, business?.name ?? 'Booking');
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.email.test',
      entity: 'Notification',
      metadata: { to, configured: status.configured, ok: result.ok },
    });
    if (!result.ok) return { ok: false, error: result.error ?? 'The mail server rejected the message.' };
    // When SMTP isn't configured the no-op provider "accepts" without sending.
    return { ok: true, simulated: !status.configured };
  } catch (error) {
    logger.error('notification.email.test.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not send the test email. Please check the SMTP settings.' };
  }
}

/** Manually drain the queue for this business (admin "Process queue" button). */
export async function processNotificationsAction(): Promise<NotificationActionResult & { summary?: ProcessResult }> {
  const session = await requirePermission('settings.manage');
  try {
    const summary = await processDueNotifications({ businessId: session.user.businessId, limit: 100 });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.process',
      entity: 'NotificationJob',
      metadata: { ...summary },
    });
    refresh();
    return { ok: true, summary };
  } catch (error) {
    logger.error('notification.process.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not process the queue. Please try again.' };
  }
}
