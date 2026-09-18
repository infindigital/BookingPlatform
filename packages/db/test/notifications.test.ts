import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createBooking } from '../src/booking/create-booking';
import { transitionBooking } from '../src/booking/transition';
import { handleBookingEvent, enqueueBookingEvent, scheduleBookingReminder } from '../src/notifications/enqueue';
import { processDueNotifications } from '../src/notifications/dispatch';
import { getNotificationTemplates, saveNotificationTemplate } from '../src/notifications/templates';
import { getNotificationActivity } from '../src/notifications/activity';
import { registerChannelProvider, resetChannelProviders, type ChannelProvider } from '../src/notifications/provider';

const prisma = new PrismaClient();

let businessId = '';
let serviceId = '';
let employeeId = '';
let customerId = '';

async function newBooking(startAt: Date, status: 'PENDING' | 'ACCEPTED' = 'PENDING') {
  return createBooking(
    {
      businessId,
      customerId,
      serviceId,
      employeeId,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      status,
      priceTotal: 50,
    },
    prisma,
  );
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `ntf-${Date.now()}`, name: 'Notify Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Cut', durationMinutes: 60, price: 50 } })).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'Ivy', lastName: 'Ng' } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'Mia', lastName: 'Doe', email: 'mia@ntf.local' } })).id;
  // EMAIL templates for the events under test.
  for (const event of ['BOOKING_CREATED', 'BOOKING_ACCEPTED', 'BOOKING_CANCELLED', 'BOOKING_REMINDER'] as const) {
    await prisma.notificationTemplate.create({
      data: { businessId, event, channel: 'EMAIL', subject: `${event} {{business.name}}`, body: `Hi {{customer.firstName}}, {{service.name}} on {{booking.date}}.` },
    });
  }
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  resetChannelProviders();
  await prisma.notificationLog.deleteMany({ where: { businessId } });
  await prisma.notificationJob.deleteMany({ where: { businessId } });
  // Clear bookings so each test can reuse the same demo slot without conflicts.
  await prisma.booking.deleteMany({ where: { businessId } });
});

describe('enqueue', () => {
  it('creates a QUEUED job for an event with an active template', async () => {
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await enqueueBookingEvent(businessId, b.id, 'BOOKING_CREATED', prisma);
    const jobs = await prisma.notificationJob.findMany({ where: { businessId, bookingId: b.id, event: 'BOOKING_CREATED' } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe('QUEUED');
    expect(jobs[0]!.channel).toBe('EMAIL');
  });

  it('does not enqueue for a deactivated template', async () => {
    await saveNotificationTemplate(businessId, { event: 'BOOKING_CREATED', subject: 's', body: 'b', isActive: false }, prisma);
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await enqueueBookingEvent(businessId, b.id, 'BOOKING_CREATED', prisma);
    const jobs = await prisma.notificationJob.findMany({ where: { businessId, bookingId: b.id, event: 'BOOKING_CREATED' } });
    expect(jobs).toHaveLength(0);
    // restore
    await saveNotificationTemplate(businessId, { event: 'BOOKING_CREATED', subject: 's', body: 'b', isActive: true }, prisma);
  });
});

describe('reminder scheduling', () => {
  it('schedules a future reminder and cancels it on cancellation', async () => {
    const start = new Date(Date.now() + 3 * 24 * 60 * 60_000); // 3 days out
    const b = await newBooking(start, 'ACCEPTED');
    await handleBookingEvent(businessId, b.id, 'BOOKING_ACCEPTED', prisma);
    const reminder = await prisma.notificationJob.findFirst({ where: { businessId, bookingId: b.id, event: 'BOOKING_REMINDER' } });
    expect(reminder).not.toBeNull();
    expect(reminder!.status).toBe('QUEUED');
    expect(reminder!.scheduledAt.getTime()).toBeLessThan(start.getTime());

    await transitionBooking(businessId, b.id, 'CANCELLED', prisma);
    await handleBookingEvent(businessId, b.id, 'BOOKING_CANCELLED', prisma);
    const after = await prisma.notificationJob.findFirst({ where: { businessId, bookingId: b.id, event: 'BOOKING_REMINDER' } });
    expect(after!.status).toBe('CANCELLED');
  });

  it('does not schedule a reminder in the past', async () => {
    const b = await newBooking(new Date(Date.now() + 60_000)); // 1 minute out → reminder is in the past
    await scheduleBookingReminder(businessId, b.id, prisma);
    const reminder = await prisma.notificationJob.findFirst({ where: { businessId, bookingId: b.id, event: 'BOOKING_REMINDER' } });
    expect(reminder).toBeNull();
  });
});

describe('dispatcher', () => {
  it('sends a due job through the provider, marks SENT and logs it', async () => {
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await enqueueBookingEvent(businessId, b.id, 'BOOKING_CREATED', prisma);

    const res = await processDueNotifications({ businessId }, prisma);
    expect(res.sent).toBe(1);

    const job = await prisma.notificationJob.findFirst({ where: { businessId, bookingId: b.id, event: 'BOOKING_CREATED' } });
    expect(job!.status).toBe('SENT');
    const log = await prisma.notificationLog.findFirst({ where: { businessId, jobId: job!.id } });
    expect(log!.status).toBe('SENT');
    expect(log!.recipient).toBe('mia@ntf.local');
    expect(log!.providerMessageId).toBeTruthy();
  });

  it('does not process a job scheduled in the future', async () => {
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await prisma.notificationJob.create({
      data: { businessId, bookingId: b.id, event: 'BOOKING_REMINDER', channel: 'EMAIL', status: 'QUEUED', scheduledAt: new Date(Date.now() + 3600_000) },
    });
    const res = await processDueNotifications({ businessId }, prisma);
    expect(res.claimed).toBe(0);
  });

  it('retries a failing job with backoff, then FAILS after maxAttempts', async () => {
    const failing: ChannelProvider = { async send() { return { ok: false, error: 'provider down' }; } };
    registerChannelProvider('EMAIL', failing);

    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    const job = await prisma.notificationJob.create({
      data: { businessId, bookingId: b.id, event: 'BOOKING_CREATED', channel: 'EMAIL', status: 'QUEUED', scheduledAt: new Date(), maxAttempts: 2 },
    });

    // First pass → fails, requeued for the future with attempts=1.
    let res = await processDueNotifications({ businessId, now: new Date() }, prisma);
    expect(res.retried).toBe(1);
    let after = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    expect(after!.status).toBe('QUEUED');
    expect(after!.attempts).toBe(1);
    expect(after!.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    expect(after!.lastError).toBe('provider down');

    // Force it due again → second failure hits maxAttempts → FAILED.
    res = await processDueNotifications({ businessId, now: new Date(after!.scheduledAt.getTime() + 1000) }, prisma);
    expect(res.failed).toBe(1);
    after = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    expect(after!.status).toBe('FAILED');
    expect(after!.attempts).toBe(2);
    const logs = await prisma.notificationLog.count({ where: { businessId, jobId: job.id, status: 'FAILED' } });
    expect(logs).toBe(2);
  });
});

describe('templates + activity read models', () => {
  it('getNotificationTemplates merges stored rows with defaults for all events', async () => {
    const templates = await getNotificationTemplates(businessId, prisma);
    expect(templates.length).toBeGreaterThanOrEqual(8);
    const created = templates.find((t) => t.event === 'BOOKING_CREATED')!;
    expect(created.isCustom).toBe(true);
    const followUp = templates.find((t) => t.event === 'BOOKING_FOLLOW_UP')!;
    expect(followUp.isCustom).toBe(false); // falls back to default copy
    expect(followUp.body.length).toBeGreaterThan(0);
  });

  it('getNotificationActivity returns rows with context and status counts', async () => {
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await enqueueBookingEvent(businessId, b.id, 'BOOKING_CREATED', prisma);
    await processDueNotifications({ businessId }, prisma);

    const activity = await getNotificationActivity(businessId, {}, prisma);
    expect(activity.rows.length).toBeGreaterThan(0);
    expect(activity.counts.SENT).toBeGreaterThanOrEqual(1);
    const row = activity.rows[0]!;
    expect(row.eventLabel).toBeTruthy();
    expect(row.customerName).toBe('Mia Doe');
  });
});
