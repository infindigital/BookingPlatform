import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { createBooking } from '../src/booking/create-booking';
import { emitBookingWebhook } from '../src/integrations/emit';
import { processWebhookDeliveries, sendWebhookPing, retryWebhookDelivery } from '../src/integrations/dispatch';
import { deliverWebhookRequest } from '../src/integrations/deliver';
import { verifySignature, signatureHeaderValue } from '../src/integrations/signing';
import { getWebhookList, getWebhookDeliveries } from '../src/integrations/read';

const prisma = new PrismaClient();

let businessId = '';
let serviceId = '';
let employeeId = '';
let customerId = '';

interface Received {
  headers: http.IncomingHttpHeaders;
  body: string;
  url: string | undefined;
}

function startServer(): Promise<{ port: number; received: Received[]; setStatus: (s: number) => void; close: () => Promise<void> }> {
  const received: Received[] = [];
  let status = 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body, url: req.url });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: status < 300 }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, received, setStatus: (s) => (status = s), close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}

async function newBooking(startAt: Date) {
  return createBooking(
    { businessId, customerId, serviceId, employeeId, startAt, endAt: new Date(startAt.getTime() + 60 * 60_000), status: 'ACCEPTED', priceTotal: 75 },
    prisma,
  );
}

async function createHook(url: string, events: string[], isActive = true) {
  return prisma.webhook.create({ data: { businessId, url, secret: 'whsec_test_secret', events, isActive } });
}

beforeAll(async () => {
  const biz = await prisma.business.create({ data: { slug: `wh-${Date.now()}`, name: 'Hook Co', timezone: 'UTC', currency: 'USD' } });
  businessId = biz.id;
  serviceId = (await prisma.service.create({ data: { businessId, name: 'Cut', durationMinutes: 60, price: 75 } })).id;
  employeeId = (await prisma.employee.create({ data: { businessId, firstName: 'Ivy', lastName: 'Ng' } })).id;
  customerId = (await prisma.customer.create({ data: { businessId, firstName: 'Mia', lastName: 'Doe', email: 'mia@wh.local' } })).id;
});

afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: businessId } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.webhookDelivery.deleteMany({ where: { businessId } });
  await prisma.webhook.deleteMany({ where: { businessId } });
  await prisma.booking.deleteMany({ where: { businessId } });
});

describe('emit', () => {
  it('creates a PENDING delivery per active subscribed webhook, and skips others', async () => {
    await createHook('https://a.example.com/hook', ['booking.confirmed', 'booking.cancelled']);
    await createHook('https://b.example.com/hook', ['booking.created']); // not subscribed to confirmed
    await createHook('https://c.example.com/hook', ['booking.confirmed'], false); // inactive
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));

    await emitBookingWebhook(businessId, b.id, 'BOOKING_ACCEPTED', prisma); // → booking.confirmed
    const deliveries = await prisma.webhookDelivery.findMany({ where: { businessId, event: 'booking.confirmed' } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.status).toBe('PENDING');
  });

  it('ignores notification-only events (no public webhook)', async () => {
    await createHook('https://a.example.com/hook', ['booking.confirmed']);
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await emitBookingWebhook(businessId, b.id, 'BOOKING_REMINDER', prisma);
    expect(await prisma.webhookDelivery.count({ where: { businessId } })).toBe(0);
  });
});

describe('dispatch (against a local HTTP server)', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it('delivers a due PENDING with a valid signature and marks SUCCESS', async () => {
    const hook = await createHook(`http://127.0.0.1:${server.port}/hook`, ['booking.confirmed']);
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await emitBookingWebhook(businessId, b.id, 'BOOKING_ACCEPTED', prisma);

    const res = await processWebhookDeliveries({ businessId }, prisma);
    expect(res.delivered).toBe(1);

    const delivery = await prisma.webhookDelivery.findFirst({ where: { businessId } });
    expect(delivery!.status).toBe('SUCCESS');
    expect(delivery!.statusCode).toBe(200);

    // The receiver got a signed request it can verify with the shared secret.
    expect(server.received).toHaveLength(1);
    const got = server.received[0]!;
    expect(got.headers['x-booking-event']).toBe('booking.confirmed');
    const sig = got.headers['x-booking-signature'] as string;
    expect(verifySignature(hook.secret, sig, got.body)).toBe(true);
    expect(verifySignature(hook.secret, sig, got.body + 'tamper')).toBe(false);

    const envelope = JSON.parse(got.body);
    expect(envelope.event).toBe('booking.confirmed');
    expect(envelope.data.booking.customer.email).toBe('mia@wh.local');
    expect(envelope.id).toBe(delivery!.id);
  });

  it('retries a failing endpoint with backoff, then FAILS at max attempts', async () => {
    server.setStatus(500);
    await createHook(`http://127.0.0.1:${server.port}/hook`, ['booking.confirmed']);
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await emitBookingWebhook(businessId, b.id, 'BOOKING_ACCEPTED', prisma);

    // Drive 5 attempts, forcing each to be "due" by advancing the injected clock.
    let last;
    for (let i = 0; i < 6; i++) {
      const now = new Date(Date.now() + i * 3 * 60 * 60_000); // +3h each pass
      last = await processWebhookDeliveries({ businessId, now }, prisma);
    }
    const delivery = await prisma.webhookDelivery.findFirst({ where: { businessId } });
    expect(delivery!.status).toBe('FAILED');
    expect(delivery!.attempts).toBe(5);
    expect(delivery!.statusCode).toBe(500);
    expect(server.received.length).toBe(5); // exactly max attempts, no more
    expect(last!.claimed).toBe(0); // nothing left to do on the final pass
  });

  it('sends an immediate ping and records it', async () => {
    const hook = await createHook(`http://127.0.0.1:${server.port}/hook`, ['booking.created']);
    const out = await sendWebhookPing(businessId, hook.id, prisma);
    expect(out!.ok).toBe(true);
    const ping = await prisma.webhookDelivery.findFirst({ where: { businessId, event: 'ping' } });
    expect(ping!.status).toBe('SUCCESS');
    expect(server.received[0]!.headers['x-booking-event']).toBe('ping');
  });

  it('re-arms a FAILED delivery via manual retry', async () => {
    server.setStatus(500);
    const hook = await createHook(`http://127.0.0.1:${server.port}/hook`, ['booking.confirmed']);
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await emitBookingWebhook(businessId, b.id, 'BOOKING_ACCEPTED', prisma);
    for (let i = 0; i < 6; i++) await processWebhookDeliveries({ businessId, now: new Date(Date.now() + i * 3 * 60 * 60_000) }, prisma);
    const failed = await prisma.webhookDelivery.findFirst({ where: { businessId } });
    expect(failed!.status).toBe('FAILED');

    server.setStatus(200);
    const ok = await retryWebhookDelivery(businessId, failed!.id, prisma);
    expect(ok).toBe(true);
    const res = await processWebhookDeliveries({ businessId }, prisma);
    expect(res.delivered).toBe(1);
    const reloaded = await prisma.webhookDelivery.findUnique({ where: { id: failed!.id } });
    expect(reloaded!.status).toBe('SUCCESS');
  });
});

describe('SSRF guard at delivery', () => {
  it('rejects a private host under production policy', async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error override for the test
    process.env.NODE_ENV = 'production';
    try {
      const out = await deliverWebhookRequest({
        url: 'http://127.0.0.1:9/hook',
        secret: 's',
        event: 'ping',
        deliveryId: 'd1',
        body: '{}',
      });
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/https|reachable/i);
    } finally {
      // @ts-expect-error restore
      process.env.NODE_ENV = prev;
    }
  });
});

describe('signing roundtrip', () => {
  it('verifies a freshly signed payload and rejects a stale timestamp', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = signatureHeaderValue('secret', ts, '{"x":1}');
    expect(verifySignature('secret', header, '{"x":1}')).toBe(true);
    const staleHeader = signatureHeaderValue('secret', ts - 10_000, '{"x":1}');
    expect(verifySignature('secret', staleHeader, '{"x":1}')).toBe(false); // outside tolerance
  });
});

describe('read models', () => {
  it('lists webhooks with delivery counts and returns delivery rows', async () => {
    const hook = await createHook('https://a.example.com/hook', ['booking.confirmed']);
    const b = await newBooking(new Date('2031-09-03T10:00:00Z'));
    await emitBookingWebhook(businessId, b.id, 'BOOKING_ACCEPTED', prisma);

    const list = await getWebhookList(businessId, prisma);
    expect(list).toHaveLength(1);
    expect(list[0]!.events).toEqual(['booking.confirmed']);
    expect(list[0]!.deliveries.pending).toBe(1);
    // Secret is never exposed in the list model.
    expect(JSON.stringify(list)).not.toContain(hook.secret);

    const rows = await getWebhookDeliveries(businessId, { webhookId: hook.id }, prisma);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.event).toBe('booking.confirmed');
  });
});
