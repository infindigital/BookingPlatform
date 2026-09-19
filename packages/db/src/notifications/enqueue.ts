import type { NotificationChannel, NotificationEvent, PrismaClient } from '@prisma/client';
import { reminderScheduledAt } from '@booking/core';
import { prisma } from '../client';
import { logger } from '../logger';
import { emitBookingWebhook } from '../integrations/emit';

/**
 * Enqueue side of the DB-backed notification queue.
 *
 * A booking event turns into one QUEUED `NotificationJob` per channel that has an
 * active template. All of this is best-effort: enqueuing must NEVER break the
 * booking mutation that triggered it, so every function swallows its own errors
 * after logging. The dispatcher (dispatch.ts) drains the queue separately.
 */

/** Events that should also (re)schedule the upcoming-appointment reminder. */
const SCHEDULES_REMINDER: NotificationEvent[] = ['BOOKING_ACCEPTED'];
/** Events that should cancel any pending reminder. */
const CANCELS_REMINDER: NotificationEvent[] = ['BOOKING_CANCELLED', 'BOOKING_REJECTED', 'BOOKING_COMPLETED'];

async function activeChannelsFor(businessId: string, event: NotificationEvent, db: PrismaClient): Promise<NotificationChannel[]> {
  const templates = await db.notificationTemplate.findMany({
    where: { businessId, event, isActive: true },
    select: { channel: true },
  });
  // Default to EMAIL when a business has no template rows for the event at all.
  if (templates.length === 0) {
    const any = await db.notificationTemplate.count({ where: { businessId, event } });
    return any === 0 ? ['EMAIL'] : [];
  }
  return templates.map((t) => t.channel);
}

/** Enqueue the immediate message(s) for a booking event across active channels. */
export async function enqueueBookingEvent(
  businessId: string,
  bookingId: string,
  event: NotificationEvent,
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    const channels = await activeChannelsFor(businessId, event, db);
    for (const channel of channels) {
      await db.notificationJob.create({
        data: { businessId, bookingId, event, channel, status: 'QUEUED', scheduledAt: new Date() },
      });
    }
    await enqueueRecipientJobs(businessId, bookingId, event, channels, db);
  } catch (error) {
    logger.error('notification.enqueue.failed', { event, bookingId, message: (error as Error)?.message });
  }
}

/**
 * Fan out extra jobs to internal recipients (staff / owner) for this event. Each
 * recipient job carries the recipient's own address on the payload so the
 * dispatcher sends it there instead of to the customer. A recipient only gets a
 * channel it opted into (empty = all), that has an active template, and that it
 * has an address for.
 */
async function enqueueRecipientJobs(
  businessId: string,
  bookingId: string,
  event: NotificationEvent,
  activeChannels: NotificationChannel[],
  db: PrismaClient,
): Promise<void> {
  if (activeChannels.length === 0) return;
  const recipients = await db.notificationRecipient.findMany({ where: { businessId, isActive: true } });
  for (const r of recipients) {
    if (r.events.length > 0 && !r.events.includes(event)) continue;
    const wanted = r.channels.length > 0 ? activeChannels.filter((c) => r.channels.includes(c)) : activeChannels;
    for (const channel of wanted) {
      const isEmail = channel === 'EMAIL';
      const address = isEmail ? r.email : r.phone;
      if (!address) continue;
      await db.notificationJob.create({
        data: {
          businessId,
          bookingId,
          event,
          channel,
          status: 'QUEUED',
          scheduledAt: new Date(),
          payload: { recipientEmail: isEmail ? r.email : null, recipientPhone: isEmail ? null : r.phone },
        },
      });
    }
  }
}

/** Schedule (or reschedule) the reminder job for a booking. Idempotent per booking+channel. */
export async function scheduleBookingReminder(
  businessId: string,
  bookingId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    const booking = await db.booking.findFirst({ where: { id: bookingId, businessId }, select: { startAt: true } });
    if (!booking) return;
    const scheduledAt = reminderScheduledAt(booking.startAt);
    // Don't schedule a reminder that is already in the past.
    if (scheduledAt.getTime() <= Date.now()) return;

    const channels = await activeChannelsFor(businessId, 'BOOKING_REMINDER', db);
    for (const channel of channels) {
      const key = `${bookingId}:BOOKING_REMINDER:${channel}`;
      const existing = await db.notificationJob.findUnique({ where: { idempotencyKey: key }, select: { id: true, status: true } });
      if (existing) {
        // Re-arm a still-pending reminder for the new time; leave sent ones alone.
        if (existing.status === 'QUEUED' || existing.status === 'CANCELLED') {
          await db.notificationJob.update({
            where: { id: existing.id },
            data: { status: 'QUEUED', scheduledAt, attempts: 0, lastError: null },
          });
        }
      } else {
        await db.notificationJob.create({
          data: { businessId, bookingId, event: 'BOOKING_REMINDER', channel, status: 'QUEUED', scheduledAt, idempotencyKey: key },
        });
      }
    }
  } catch (error) {
    logger.error('notification.reminder.schedule.failed', { bookingId, message: (error as Error)?.message });
  }
}

/** Cancel any still-queued reminder for a booking (e.g. after cancellation). */
export async function cancelBookingReminders(
  businessId: string,
  bookingId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    await db.notificationJob.updateMany({
      where: { businessId, bookingId, event: 'BOOKING_REMINDER', status: 'QUEUED' },
      data: { status: 'CANCELLED' },
    });
  } catch (error) {
    logger.error('notification.reminder.cancel.failed', { bookingId, message: (error as Error)?.message });
  }
}

/**
 * Single entry point for booking mutations: enqueue the event's own message and
 * apply the reminder policy (schedule on confirm, cancel on terminal states,
 * re-arm on reschedule). Best-effort throughout.
 */
export async function handleBookingEvent(
  businessId: string,
  bookingId: string,
  event: NotificationEvent,
  db: PrismaClient = prisma,
): Promise<void> {
  await enqueueBookingEvent(businessId, bookingId, event, db);
  if (SCHEDULES_REMINDER.includes(event)) await scheduleBookingReminder(businessId, bookingId, db);
  if (CANCELS_REMINDER.includes(event)) await cancelBookingReminders(businessId, bookingId, db);
  if (event === 'BOOKING_RESCHEDULED') await scheduleBookingReminder(businessId, bookingId, db);
  // Fan the same event out to any subscribed outbound webhooks (best-effort).
  await emitBookingWebhook(businessId, bookingId, event, db);
}
