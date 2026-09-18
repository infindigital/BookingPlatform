import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Shared config + helpers for the e2e suite. */

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..', '..');

/** The port + base URL the suite's server runs on. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3000);
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://booking:booking@127.0.0.1:5432/booking?schema=public';

/** Locate the pre-installed Chromium (this environment ships it under /opt/pw-browsers). */
export function chromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    // Match a versioned "chromium-<n>" install — not the headless-shell variant
    // and not the bare "chromium" symlink.
    const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
    if (dir) return `${base}/${dir}/chrome-linux/chrome`;
  } catch {
    /* fall through — let Playwright resolve its own default */
  }
  return undefined;
}

export async function waitForHealth(url: string, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Small typed fetch helpers for the public API. */
export function publicUrl(path: string): string {
  return `${BASE_URL}/api/v1/public${path}`;
}
