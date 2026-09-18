/**
 * Minimal structured logger for the data layer. Kept dependency-free; the app
 * layer has its own richer logger. Used for best-effort paths (notifications)
 * where a failure must be recorded but never thrown.
 */
type Fields = Record<string, unknown>;

export const logger = {
  info(event: string, fields?: Fields): void {
    console.log(JSON.stringify({ level: 'info', event, ...fields }));
  },
  warn(event: string, fields?: Fields): void {
    console.warn(JSON.stringify({ level: 'warn', event, ...fields }));
  },
  error(event: string, fields?: Fields): void {
    console.error(JSON.stringify({ level: 'error', event, ...fields }));
  },
};
