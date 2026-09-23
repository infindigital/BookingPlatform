/** Minimal surface we need - the prisma singleton satisfies this. */
interface RawExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * Non-destructive schema sync.
 *
 * The migration history in this project is purely additive - only CREATE TABLE,
 * CREATE INDEX, CREATE TYPE, ALTER TABLE ... ADD COLUMN and ADD CONSTRAINT, with
 * every added column either nullable or carrying a DEFAULT. That means the whole
 * history can be replayed against a live, populated database to bring it up to
 * the current schema WITHOUT dropping anything: existing objects are skipped and
 * only the missing ones are created.
 *
 * This is the safe counterpart to /api/admin/reprovision (which drops the schema
 * and reseeds). It repairs "column does not exist" drift - e.g. the per-service
 * pricing/booking-rule columns - while preserving all data.
 */

export interface SchemaSyncResult {
  /** Statements that ran (created something new or a no-op IF NOT EXISTS). */
  applied: number;
  /** Statements skipped because the object already existed. */
  skipped: number;
  /** Real errors (not "already exists"), capped and cleaned for display. */
  errors: string[];
}

/** Split Prisma migration SQL into individual statements (no ';' in literals). */
export function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--[^\n]*\s*)+$/.test(s));
}

/**
 * Rewrite an additive DDL statement to be idempotent where Postgres supports it:
 * CREATE TABLE/INDEX and ADD COLUMN gain IF NOT EXISTS. CREATE TYPE and ADD
 * CONSTRAINT have no IF NOT EXISTS form, so those are left as-is and their
 * "already exists" error is treated as benign at execution time.
 */
export function idempotentStatement(stmt: string): string {
  let s = stmt;
  s = s.replace(/^CREATE TABLE\s+"/i, 'CREATE TABLE IF NOT EXISTS "');
  s = s.replace(/^CREATE UNIQUE INDEX\s+"/i, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  s = s.replace(/^CREATE INDEX\s+"/i, 'CREATE INDEX IF NOT EXISTS "');
  // Every ADD COLUMN clause in the statement (a single ALTER can add several).
  s = s.replace(/ADD COLUMN\s+"/gi, 'ADD COLUMN IF NOT EXISTS "');
  return s;
}

/** A DDL error that just means the object is already present - safe to ignore. */
export function isBenignDdlError(error: unknown): boolean {
  const message = ((error as Error)?.message ?? String(error)).toLowerCase();
  return message.includes('already exists');
}

function clean(e: unknown): string {
  return ((e as Error)?.message ?? String(e)).replace(/\s+/g, ' ').trim().slice(0, 500);
}

/**
 * Apply the full migration SQL to an existing database without dropping or
 * seeding anything. Existing objects are skipped; missing ones are created.
 */
export async function syncSchema(db: RawExecutor, migrationsSql: string): Promise<SchemaSyncResult> {
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of splitStatements(migrationsSql)) {
    const stmt = idempotentStatement(raw);
    try {
      await db.$executeRawUnsafe(stmt);
      applied += 1;
    } catch (e) {
      if (isBenignDdlError(e)) {
        skipped += 1;
      } else if (errors.length < 10) {
        errors.push(clean(e));
      }
    }
  }

  return { applied, skipped, errors };
}
