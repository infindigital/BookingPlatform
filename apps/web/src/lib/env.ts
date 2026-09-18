import { z } from 'zod';

/**
 * Server-side environment validation.
 *
 * Validated once at server startup via `instrumentation.ts`. Never import this
 * into client components - these values (and, later, DATABASE_URL) must stay
 * server-side only. Set SKIP_ENV_VALIDATION=1 to bypass during tooling/CI.
 *
 * Phase 1 note: DATABASE_URL is intentionally OPTIONAL here. Phase 2 (database)
 * will promote it to required once the data layer consumes it.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  DATABASE_URL: z
    .string()
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('mysql://'), {
      message: 'DATABASE_URL must be a postgresql:// or mysql:// connection string',
    })
    .optional(),
  // NextAuth (Auth.js) session signing secret. Required in production; a dev
  // fallback keeps local runs and CI builds working without extra setup.
  AUTH_SECRET: z.string().min(1).optional(),
  // Shared secret for the notification-queue cron endpoint. When unset, the
  // endpoint is disabled (returns 404) so it can never be triggered anonymously.
  NOTIFICATIONS_CRON_SECRET: z.string().min(1).optional(),
  // Email (SMTP) transport. All optional: when SMTP_HOST + EMAIL_FROM are set the
  // real SMTP provider handles the EMAIL channel; otherwise a no-op keeps dev/demo
  // working with no mail setup. These are server-side only - credentials never
  // reach the client (cost policy: no mandatory paid email service; any SMTP works).
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_TLS_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
  // Shared secret for the webhook-delivery cron endpoint. When unset, the endpoint
  // is disabled (404) so it can never be triggered anonymously.
  WEBHOOKS_CRON_SECRET: z.string().min(1).optional(),
  // Dev/test escape hatch: allow http:// and private-host webhook targets. Never
  // set in production - outbound requests to internal hosts are an SSRF risk.
  WEBHOOKS_ALLOW_INSECURE: z.enum(['true', 'false']).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function loadEnv(): ServerEnv {
  if (process.env.SKIP_ENV_VALIDATION) {
    return serverSchema.parse({});
  }

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Fail loud and early - a misconfigured server should not boot silently.
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env: ServerEnv = loadEnv();
