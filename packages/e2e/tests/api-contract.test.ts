import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@booking/db';
import { BASE_URL, publicUrl } from './support';

/**
 * Public API contract, exercised over HTTP against a running server and the real
 * database — the layer unit/integration tests don't reach (key resolution, CORS,
 * status codes, the error envelope). Fixtures come from the seeded demo tenant.
 */

const PUBLIC_KEY = 'pk_demo_booking_123';
const E2E_EMAIL = `e2e.contract.${Date.now()}@e2e.local`;

let slug = '';
let serviceId = '';

function dayKey(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

beforeAll(async () => {
  const website = await prisma.website.findFirst({
    where: { publicKey: PUBLIC_KEY },
    include: { business: { select: { slug: true } } },
  });
  if (!website) throw new Error('e2e: seeded demo website not found — run the db seed first.');
  slug = website.business.slug;
  const service = await prisma.service.findFirst({
    where: { businessId: website.businessId, isActive: true },
    select: { id: true },
  });
  if (!service) throw new Error('e2e: no active service on the demo business.');
  serviceId = service.id;
});

afterAll(async () => {
  const custs = await prisma.customer.findMany({ where: { email: E2E_EMAIL }, select: { id: true } });
  const ids = custs.map((c) => c.id);
  if (ids.length) {
    await prisma.booking.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

describe('health', () => {
  it('reports ok', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });
});

describe('GET /config', () => {
  it('returns the catalogue + theme for a valid key', async () => {
    const res = await fetch(publicUrl('/config'), { headers: { 'X-Public-Key': PUBLIC_KEY } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.business?.name).toBeTruthy();
    expect(Array.isArray(json.services)).toBe(true);
    expect(json.services.length).toBeGreaterThan(0);
    expect(json.theme?.primary).toMatch(/^#/);
    expect(json.settings).toBeTruthy();
  });

  it('401 without a key', async () => {
    const res = await fetch(publicUrl('/config'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error?.message).toBeTruthy();
    expect(json.error?.code).toBe('unauthorized');
  });

  it('403 for an invalid key', async () => {
    const res = await fetch(publicUrl('/config'), { headers: { 'X-Public-Key': 'pk_nope' } });
    expect(res.status).toBe(403);
  });

  it('answers OPTIONS preflight with CORS headers', async () => {
    const res = await fetch(publicUrl('/config'), { method: 'OPTIONS', headers: { Origin: 'https://anywhere.example' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('GET /availability', () => {
  it('returns days for a valid range', async () => {
    const res = await fetch(
      publicUrl(`/availability?serviceId=${serviceId}&from=${dayKey(1)}&to=${dayKey(8)}`),
      { headers: { 'X-Public-Key': PUBLIC_KEY } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.days)).toBe(true);
    expect(typeof json.durationMinutes).toBe('number');
  });

  it('400 when serviceId is missing', async () => {
    const res = await fetch(publicUrl(`/availability?from=${dayKey(1)}&to=${dayKey(2)}`), {
      headers: { 'X-Public-Key': PUBLIC_KEY },
    });
    expect(res.status).toBe(400);
  });

  it('400 for malformed dates', async () => {
    const res = await fetch(publicUrl(`/availability?serviceId=${serviceId}&from=nope&to=nope`), {
      headers: { 'X-Public-Key': PUBLIC_KEY },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /bookings', () => {
  async function firstSlot(): Promise<{ dayKey: string; time: string } | null> {
    const res = await fetch(
      publicUrl(`/availability?serviceId=${serviceId}&from=${dayKey(1)}&to=${dayKey(10)}`),
      { headers: { 'X-Public-Key': PUBLIC_KEY } },
    );
    const json = await res.json();
    for (const d of json.days ?? []) {
      if (d.slots?.length) {
        const iso = d.slots[0].startISO as string;
        const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
        return { dayKey: d.dayKey, time };
      }
    }
    return null;
  }

  it('creates a PENDING booking and rejects the same slot twice (409)', async () => {
    const slot = await firstSlot();
    expect(slot).not.toBeNull();
    const body = JSON.stringify({
      serviceId,
      dayKey: slot!.dayKey,
      time: slot!.time,
      firstName: 'E2E',
      lastName: 'Contract',
      email: E2E_EMAIL,
    });
    const headers = { 'X-Public-Key': PUBLIC_KEY, 'Content-Type': 'application/json' };

    const first = await fetch(publicUrl('/bookings'), { method: 'POST', headers, body });
    expect(first.status).toBe(201);
    const created = await first.json();
    expect(created.booking?.reference).toMatch(/^[A-Z0-9]{8}$/);
    expect(created.booking?.status).toBe('PENDING');

    const second = await fetch(publicUrl('/bookings'), { method: 'POST', headers, body });
    expect(second.status).toBe(409);
    const conflict = await second.json();
    expect(conflict.error?.message).toBeTruthy();
  });

  it('400 when serviceId is missing', async () => {
    const res = await fetch(publicUrl('/bookings'), {
      method: 'POST',
      headers: { 'X-Public-Key': PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('413 for an oversized body', async () => {
    const big = JSON.stringify({ serviceId, notes: 'a'.repeat(9_000) });
    const res = await fetch(publicUrl('/bookings'), {
      method: 'POST',
      headers: { 'X-Public-Key': PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: big,
    });
    expect(res.status).toBe(413);
  });
});

describe('security headers', () => {
  it('the home page is same-origin framed and nosniff', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });

  it('the login page denies framing (clickjacking)', async () => {
    const res = await fetch(`${BASE_URL}/login`);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('the public booking page is embeddable (iframe fallback)', async () => {
    const res = await fetch(`${BASE_URL}/book/${slug}`);
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors *');
    expect(res.headers.get('x-frame-options')).toBeNull();
  });
});
