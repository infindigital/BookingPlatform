import { spawn, type ChildProcess } from 'node:child_process';
import { BASE_URL, DATABASE_URL, E2E_PORT, REPO_ROOT, waitForHealth } from './support';

/**
 * Vitest global setup: ensure a web server is running for the whole suite.
 *
 * If one is already answering on the target URL we reuse it (fast local
 * iteration); otherwise we boot `next dev` on an isolated port and tear it down
 * afterwards. No new dependency — just Node's child_process.
 */
let server: ChildProcess | null = null;

export async function setup(): Promise<void> {
  if (await waitForHealth(BASE_URL, 2_000)) {
    // Already up — reuse it.
    return;
  }

  server = spawn('pnpm', ['--filter', 'web', 'dev'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL, PORT: String(E2E_PORT) },
    stdio: 'ignore',
    detached: true,
  });

  const ok = await waitForHealth(BASE_URL, 150_000);
  if (!ok) {
    teardownProcess();
    throw new Error(`e2e: web server did not become healthy at ${BASE_URL}`);
  }
}

export async function teardown(): Promise<void> {
  teardownProcess();
}

function teardownProcess(): void {
  if (server && server.pid) {
    try {
      // Kill the whole process group (detached), so Next's children die too.
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      try {
        server.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
    server = null;
  }
}
