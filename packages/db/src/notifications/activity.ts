import type { NotificationChannel, NotificationEvent, NotificationJobStatus, PrismaClient } from '@prisma/client';
import { NOTIFICATION_EVENTS } from '@booking/core';
import { prisma } from '../client';
import { referenceFor } from '../public/reference';

/**
 * Read model for the Notifications activity view: recent queue jobs with their
 * booking/customer context and delivery outcome, plus a status roll-up. Tenant-scoped.
 */

export interface NotificationActivityRow {
  id: string;
  event: NotificationEvent;
  eventLabel: string;
  channel: NotificationChannel;
  status: NotificationJobStatus;
  scheduledISO: string;
  createdISO: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  recipient: string | null;
  bookingReference: string | null;
  serviceName: string | null;
  customerName: string | null;
  deliveredISO: string | null;
}

export interface NotificationActivity {
  rows: NotificationActivityRow[];
  counts: Record<NotificationJobStatus, number>;
}

const EVENT_LABEL = new Map(NOTIFICATION_EVENTS.map((e) => [e.event, e.label] as const));

export async function getNotificationActivity(
  businessId: string,
  opts: { limit?: number } = {},
  db: PrismaClient = prisma,
): Promise<NotificationActivity> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  const [jobs, grouped] = await Promise.all([
    db.notificationJob.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        event: true,
        channel: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        bookingId: true,
        booking: {
          select: {
            service: { select: { name: true } },
            customer: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        logs: { orderBy: { createdAt: 'desc' }, take: 1, select: { recipient: true, status: true, createdAt: true } },
      },
    }),
    db.notificationJob.groupBy({ by: ['status'], where: { businessId }, _count: { _all: true } }),
  ]);

  const counts: Record<NotificationJobStatus, number> = { QUEUED: 0, PROCESSING: 0, SENT: 0, FAILED: 0, CANCELLED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;

  const rows: NotificationActivityRow[] = jobs.map((j) => {
    const latestLog = j.logs[0];
    const customer = j.booking?.customer;
    return {
      id: j.id,
      event: j.event,
      eventLabel: EVENT_LABEL.get(j.event) ?? j.event,
      channel: j.channel,
      status: j.status,
      scheduledISO: j.scheduledAt.toISOString(),
      createdISO: j.createdAt.toISOString(),
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: j.lastError,
      recipient: latestLog?.recipient ?? customer?.email ?? null,
      bookingReference: j.bookingId ? referenceFor(j.bookingId) : null,
      serviceName: j.booking?.service?.name ?? null,
      customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : null,
      deliveredISO: latestLog && latestLog.status === 'SENT' ? latestLog.createdAt.toISOString() : null,
    };
  });

  return { rows, counts };
}
