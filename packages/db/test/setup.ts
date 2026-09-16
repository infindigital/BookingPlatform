import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load packages/db/.env into process.env (no dotenv dependency) so the Prisma
// client can construct before the test modules import it.
const here = dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(resolve(here, '..', '.env'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && !process.env[m[1]]) {
        process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // fall through — the test will fail loudly if DATABASE_URL is truly absent
  }
}
