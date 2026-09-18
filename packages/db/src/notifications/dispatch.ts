import type { NotificationChannel, NotificationEvent, PrismaClient } from '@prisma/client';
import { renderTemplate, defaultTemplate, nextRetryAt, shouldRetry, type NotificationEventKey } from '@booking/core';
import { prisma } from '../client';
import { logger } from '../logger';
import { getChannelProvider } from './provider';
import { buildBookingContext } from './variables';

/**
 * DB-backed queue dispatcher. No Redis, no external broker (cost policy): a due
 * job is one with status QUEUED and scheduledAt <= now. Each job is claimed with
 * an optimistic status guard (QUEUED → PROCESSING via updateMany) so concurrent
 * workers can't double-send. Delivery goes through the pluggable channel provider;
 * every attempt is written to NotificationLog. Failures retry with exponential
 * backoff until maxAttempts, then land in FAILED.
 *
 * This is designed to be driven by a cron / scheduled call (or the admin's
 * "Process queue" action) — it does one bounded pass and returns a summary.
 */

export interface ProcessResult {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

async function templateFor(
  businessId: string,
  event: NotificationEvent,
  channel: NotificationChannel,
  db: PrismaClient,
): Promise<{ subject: string | null; body: string }> {
  const row = await db.notificationTemplate.findFirst({
    where: { businessId, event, channel },
    select: { subject: true, body: true, isActive: true },
  });
  if (row && row.isActive !== false) return { subject: row.subject, body: row.body };
  const def = defaultTemplate(event as NotificationEventKey);
  return { subject: def.subject, body: def.body };
}

export async function processDueNotifications(
  opts: { limit?: number; now?: Date; businessId?: string } = {},
  db: PrismaClient = prisma,
): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const result: ProcessResult = { claimed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };

  const due = await db.notificationJob.findMany({
    where: { status: 'QUEUED', scheduledAt: { lte: now }, ...(opts.businessId ? { businessId: opts.businessId } : {}) },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  for (const { id } of due) {
    // Optimistic claim: only the worker that flips QUEUED → PROCESSING proceeds.
    const claim = await db.notificationJob.updateMany({
      where: { id, status: 'QUEUED' },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    const job = await db.notificationJob.findUnique({ where: { id } });
    if (!job) continue;

    const attempt = job.attempts + 1;
    try {
      const ctx = job.bookingId ? await buildBookingContext(job.businessId, job.bookingId, db) : null;
      const recipient =
        job.channel === 'EMAIL' ? ctx?.recipientEmail ?? '' : ctx?.recipientPhone ?? ctx?.recipientEmail ?? '';
      const tmpl = await templateFor(job.businessId, job.event, job.channel, db);
      const vars = ctx?.vars ?? {};
      const subject = tmpl.subject ? renderTemplate(tmpl.subject, vars) : null;
      const body = renderTemplate(tmpl.body, vars);

      const provider = getChannelProvider(job.channel);
      const send = await provider.send({
        channel: job.channel,
        recipient,
        subject,
        body,
        event: job.event,
        bookingId: job.bookingId,
      });

      if (send.ok) {
        await db.$transaction([
          db.notificationJob.update({ where: { id }, data: { status: 'SENT', attempts: attempt, lastError: null } }),
          db.notificationLog.create({
            data: {
              businessId: job.businessId,
              jobId: id,
              channel: job.channel,
              recipient: recipient || '(none)',
              status: 'SENT',
              providerMessageId: send.providerMessageId ?? null,
              attempt,
            },
          }),
        ]);
        result.sent += 1;
      } else {
        await failJob(db, id, job.businessId, job.channel, recipient, attempt, job.maxAttempts, send.error ?? 'Send failed.', now, result);
      }
    } catch (error) {
      await failJob(db, id, job.businessId, job.channel, '', attempt, job.maxAttempts, (error as Error)?.message ?? 'Unknown error', now, result);
    }
  }

  if (result.claimed > 0) logger.info('notification.dispatch.pass', { ...result });
  return result;
}

async function failJob(
  db: PrismaClient,
  id: string,
  businessId: string,
  channel: NotificationChannel,
  recipient: string,
  attempt: number,
  maxAttempts: number,
  error: string,
  now: Date,
  result: ProcessResult,
): Promise<void> {
  const retry = shouldRetry(attempt, maxAttempts);
  await db.$transaction([
    db.notificationJob.update({
      where: { id },
      data: retry
        ? { status: 'QUEUED', attempts: attempt, lastError: error, scheduledAt: nextRetryAt(attempt, now) }
        : { status: 'FAILED', attempts: attempt, lastError: error },
    }),
    db.notificationLog.create({
      data: {
        businessId,
        jobId: id,
        channel,
        recipient: recipient || '(none)',
        status: 'FAILED',
        error,
        attempt,
      },
    }),
  ]);
  if (retry) result.retried += 1;
  else result.failed += 1;
}
