import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { prisma } from '@booking/db';
import { BASE_URL, chromiumExecutable } from './support';

/**
 * Critical user journeys through a real browser: the embeddable widget's booking
 * flow (the product's money path) and admin sign-in. These catch UI-level
 * regressions that HTTP contract tests can't see.
 */

const WIDGET_EMAIL = `e2e.widget.${Date.now()}@e2e.local`;
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: chromiumExecutable() });
});

afterAll(async () => {
  await browser?.close();
  const custs = await prisma.customer.findMany({ where: { email: WIDGET_EMAIL }, select: { id: true } });
  const ids = custs.map((c) => c.id);
  if (ids.length) {
    await prisma.booking.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

function inline(page: Page) {
  return page.locator('div[data-booking-key]:not([data-booking-mode])').first();
}

describe('embeddable widget booking flow', () => {
  it('books an appointment end-to-end and shows a confirmation reference', async () => {
    const page = await browser.newContext({ viewport: { width: 1200, height: 1400 } }).then((c) => c.newPage());
    await page.goto(`${BASE_URL}/widget-demo.html`, { waitUntil: 'networkidle' });

    const root = inline(page);
    await root.locator('.bw-card-name').first().waitFor({ timeout: 20_000 });

    // 1. service
    await root.locator('.bw-card').first().click();
    // 2. team -> Any available (step is shown when the service has staff)
    const anyBtn = root.locator('.bw-card', { hasText: 'Any available' });
    if (await anyBtn.count()) {
      await anyBtn.first().click();
    }
    // 3. date & time — walk the day chips until one has slots
    await page.locator('.bw-title', { hasText: 'date' }).first().waitFor({ timeout: 10_000 });
    const days = root.locator('.bw-day');
    const n = await days.count();
    let picked = false;
    for (let i = 1; i < n && !picked; i++) {
      await days.nth(i).click();
      await page.waitForTimeout(700);
      const slots = root.locator('.bw-slot');
      if (await slots.count()) {
        await slots.first().click();
        picked = true;
      }
    }
    expect(picked).toBe(true);
    // 4. details
    await page.locator('.bw-title', { hasText: 'Your details' }).first().waitFor({ timeout: 10_000 });
    await root.locator('input.bw-input').nth(0).fill('E2E');
    await root.locator('input.bw-input').nth(1).fill('Widget');
    await root.locator('input[type="email"]').fill(WIDGET_EMAIL);
    await root.locator('.bw-btn-primary', { hasText: 'Continue' }).click();
    // 5. review -> confirm
    await page.locator('.bw-title', { hasText: 'Review' }).first().waitFor({ timeout: 10_000 });
    await root.locator('.bw-btn-primary', { hasText: 'Confirm' }).click();
    // 6. confirmation
    await page.locator('.bw-title', { hasText: 'received' }).first().waitFor({ timeout: 20_000 });
    const ref = (await root.locator('.bw-ref').first().textContent())?.trim() ?? '';
    expect(ref).toMatch(/^[A-Z0-9]{8}$/);

    // The booking really landed as PENDING in the tenant.
    const booking = await prisma.booking.findFirst({
      where: { customer: { email: WIDGET_EMAIL } },
      select: { status: true, source: true },
    });
    expect(booking?.status).toBe('PENDING');
    expect(booking?.source).toBe('public');
  });
});

describe('admin sign-in', () => {
  it('authenticates the seeded admin and lands on /admin', async () => {
    const page = await browser.newContext().then((c) => c.newPage());
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#email', 'admin@aurora.example');
    await page.fill('#password', 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin/, { timeout: 20_000 });
    expect(new URL(page.url()).pathname.startsWith('/admin')).toBe(true);
  });

  it('redirects an unauthenticated visitor away from /admin', async () => {
    const page = await browser.newContext().then((c) => c.newPage());
    const res = await page.goto(`${BASE_URL}/admin/analytics`, { waitUntil: 'domcontentloaded' });
    // Middleware sends them to the login page with a callback URL.
    expect(page.url()).toContain('/login');
    expect(res?.status()).toBeLessThan(500);
  });
});
