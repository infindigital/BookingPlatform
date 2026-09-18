/**
 * Cross-dialect SQL helpers.
 *
 * Almost everything in the data layer goes through Prisma, which is
 * dialect-agnostic. The exception is the handful of transaction **row locks**
 * (`SELECT … FOR UPDATE`) that guarantee no double-booking / overbooking. Those
 * are hand-written SQL, and the two supported dialects differ in exactly two
 * ways that matter here:
 *
 *   - identifier quoting — PostgreSQL uses "Ident", MySQL/MariaDB use `Ident`;
 *   - positional placeholders — PostgreSQL uses $1/$2, MySQL/MariaDB use ?.
 *
 * `SELECT … FOR UPDATE` itself is supported by PostgreSQL, MySQL (InnoDB) and
 * MariaDB, so the same lock strategy is portable once quoting is correct.
 * The dialect is derived from `DATABASE_URL`, so switching a client to MySQL is
 * purely a connection-string + Prisma `provider` change — no code edits.
 */
export type SqlDialect = 'postgresql' | 'mysql';

export function detectDialect(url: string | undefined = process.env.DATABASE_URL): SqlDialect {
  const u = (url ?? '').toLowerCase();
  return u.startsWith('mysql://') || u.startsWith('mariadb://') ? 'mysql' : 'postgresql';
}

let cached: SqlDialect | null = null;
/** The active dialect (cached — a process targets a single database). */
export function dialect(): SqlDialect {
  if (cached === null) cached = detectDialect();
  return cached;
}

/** For tests: recompute the dialect from the current env on next use. */
export function resetDialectCache(): void {
  cached = null;
}

/** Quote a table/column identifier for the given dialect. */
export function quoteIdent(name: string, d: SqlDialect = dialect()): string {
  return d === 'mysql' ? `\`${name}\`` : `"${name}"`;
}

/** Positional placeholder for the given 1-based parameter index. */
export function placeholder(index: number, d: SqlDialect = dialect()): string {
  return d === 'mysql' ? '?' : `$${index}`;
}

/**
 * Build a `SELECT <columns> FROM <table> WHERE id = ? AND businessId = ? FOR
 * UPDATE` lock, quoted + parameterised for the active dialect. The identifiers
 * are compile-time constants and the two values are bound separately by
 * `$queryRawUnsafe`, so this is not an injection surface.
 */
export function forUpdateByIdAndBusiness(table: string, columns = 'id', d: SqlDialect = dialect()): string {
  return (
    `SELECT ${columns} FROM ${quoteIdent(table, d)} ` +
    `WHERE id = ${placeholder(1, d)} AND ${quoteIdent('businessId', d)} = ${placeholder(2, d)} FOR UPDATE`
  );
}
