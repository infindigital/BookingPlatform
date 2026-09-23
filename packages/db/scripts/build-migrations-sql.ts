/**
 * Generate apps/web/src/lib/migrations-sql.ts from the Prisma migration files.
 *
 * The migrations under prisma/migrations are the schema source of truth. This
 * concatenates them (in lexical order, which is chronological for Prisma's
 * timestamped folder names) into a single SQL string the runtime reprovision
 * route can execute against a freshly reset schema. Regenerate after adding a
 * migration:  pnpm --filter @booking/db build:migrations-sql
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, '../prisma/migrations');
const outFile = resolve(here, '../../../apps/web/src/lib/migrations-sql.ts');

const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const parts: string[] = [];
for (const dir of dirs) {
  const sql = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');
  parts.push(`-- migration: ${dir}\n${sql.trim()}`);
}
const combined = parts.join('\n\n');

const header = [
  '// AUTO-GENERATED from packages/db/prisma/migrations - do not edit by hand.',
  '// Regenerate with: pnpm --filter @booking/db build:migrations-sql',
  '// The concatenated migration SQL (schema source of truth), executed by the',
  '// runtime reprovision route against a freshly reset schema.',
  '',
].join('\n');

writeFileSync(outFile, `${header}export const MIGRATIONS_SQL: string = ${JSON.stringify(combined)};\n`);
// eslint-disable-next-line no-console
console.log(`Wrote ${outFile} (${combined.length} chars from ${dirs.length} migrations).`);
