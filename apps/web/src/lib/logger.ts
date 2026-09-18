/**
 * Minimal structured logger - dependency-free, JSON lines in production,
 * readable text in development. Respects LOG_LEVEL. Server-side only.
 *
 * Kept intentionally small in Phase 1; can be swapped for pino/OpenTelemetry
 * later behind this same interface without touching call sites.
 *
 * This module is the single sanctioned place for direct console access.
 */
/* eslint-disable no-console */
type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? 'info') as Level;
  return raw in LEVEL_WEIGHT ? raw : 'info';
}

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[activeLevel()]) return;

  const entry = { ts: new Date().toISOString(), level, message, ...meta };

  if (process.env.NODE_ENV === 'production') {
    // Structured single-line JSON for log collectors.
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const prefix = `[${entry.ts}] ${level.toUpperCase()}`;
  const rest = meta && Object.keys(meta).length ? meta : '';
  if (level === 'error') console.error(prefix, message, rest);
  else if (level === 'warn') console.warn(prefix, message, rest);
  else console.log(prefix, message, rest);
}

export const logger = {
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
};
