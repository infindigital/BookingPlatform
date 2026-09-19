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
  repositoriesFor,
  writeAudit,
  type NotificationTemplateConfig,
  type NotificationActivity,
  type NotificationEvent,
  type NotificationChannel,
  type EmailConfigStatus,
  type SmsSettingsStatus,
  type RecipientRow,
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

// --- SMS provider (Twilio) settings -----------------------------------------

export async function loadSmsSettings(): Promise<SmsSettingsStatus> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).settings.getSmsSettingsStatus();
}

export async function saveSmsSettingsAction(input: {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  isEnabled: boolean;
}): Promise<NotificationActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    await repositoriesFor(session.user.businessId).settings.saveSmsSettings({
      accountSid: input.accountSid,
      // Blank token means "keep the stored one".
      authToken: input.authToken.trim() || null,
      fromNumber: input.fromNumber,
      isEnabled: input.isEnabled,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.sms.save',
      entity: 'SmsSettings',
      metadata: { enabled: input.isEnabled },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if ((error as { message?: string })?.message?.includes('ENCRYPTION_KEY')) {
      return { ok: false, error: (error as Error).message };
    }
    logger.error('notification.sms.save.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the SMS settings. Please try again.' };
  }
}

// --- Notification recipients ------------------------------------------------

const VALID_CHANNELS = new Set<NotificationChannel>(['EMAIL', 'WHATSAPP', 'SMS']);

function cleanChannels(list: string[]): NotificationChannel[] {
  return [...new Set(list)].filter((c): c is NotificationChannel => VALID_CHANNELS.has(c as NotificationChannel));
}
function cleanEvents(list: string[]): NotificationEvent[] {
  return [...new Set(list)].filter((e): e is NotificationEvent => VALID_EVENTS.has(e as NotificationEvent));
}

export async function loadRecipients(): Promise<RecipientRow[]> {
  const session = await requirePermission('settings.manage');
  return repositoriesFor(session.user.businessId).settings.listRecipients();
}

export interface RecipientFormInput {
  name: string | null;
  email: string | null;
  phone: string | null;
  channels: string[];
  events: string[];
  isActive: boolean;
}

export async function createRecipientAction(input: RecipientFormInput): Promise<NotificationActionResult> {
  const session = await requirePermission('settings.manage');
  try {
    await repositoriesFor(session.user.businessId).settings.createRecipient({
      name: input.name,
      email: input.email,
      phone: input.phone,
      channels: cleanChannels(input.channels),
      events: cleanEvents(input.events),
      isActive: input.isActive,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.recipient.create',
      entity: 'NotificationRecipient',
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') return { ok: false, error: error.message };
    logger.error('notification.recipient.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not add the recipient. Please try again.' };
  }
}

export async function updateRecipientAction(id: string, input: RecipientFormInput): Promise<NotificationActionResult> {
  const session = await requirePermission('settings.manage');
  if (!id) return { ok: false, error: 'Missing recipient.' };
  try {
    const res = await repositoriesFor(session.user.businessId).settings.updateRecipient(id, {
      name: input.name,
      email: input.email,
      phone: input.phone,
      channels: cleanChannels(input.channels),
      events: cleanEvents(input.events),
      isActive: input.isActive,
    });
    if (res.count === 0) return { ok: false, error: 'Recipient not found.' };
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.recipient.update',
      entity: 'NotificationRecipient',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') return { ok: false, error: error.message };
    logger.error('notification.recipient.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the recipient. Please try again.' };
  }
}

export async function deleteRecipientAction(id: string): Promise<NotificationActionResult> {
  const session = await requirePermission('settings.manage');
  if (!id) return { ok: false, error: 'Missing recipient.' };
  try {
    await repositoriesFor(session.user.businessId).settings.deleteRecipient(id);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'notification.recipient.delete',
      entity: 'NotificationRecipient',
      entityId: id,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('notification.recipient.delete.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not delete the recipient. Please try again.' };
  }
}
