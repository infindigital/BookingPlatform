import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { findUserForAuth, verifyPassword, writeAudit } from '@booking/db';
import { RateLimiter } from '@booking/core';
import { logger } from '@/lib/logger';
import { authConfig } from './config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  businessSlug: z.string().optional(),
});

/**
 * Brute-force throttle for credential logins. In-process, dependency-free (no
 * Redis) — a best-effort guard keyed by email+IP that blocks after too many
 * attempts in a short window. A successful login clears the counter, so a
 * legitimate user who mistypes a few times is never locked out for long.
 */
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginLimiter = new RateLimiter({ limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });

function clientIpFrom(request: Request | undefined): string {
  const fwd = request?.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return request?.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Full Auth.js instance (Node runtime). Adds the Credentials provider that
 * verifies against the database, and audits successful logins.
 */
const result = NextAuth({
  ...authConfig,
  // A dev-only fallback secret; production must set AUTH_SECRET.
  secret: process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me',
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        businessSlug: { label: 'Business', type: 'text' },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password, businessSlug } = parsed.data;

        // Throttle before any DB / bcrypt work so brute force is cheap to deny.
        const throttleKey = `${email.toLowerCase()}:${clientIpFrom(request)}`;
        if (!loginLimiter.check(throttleKey).allowed) {
          logger.warn('auth.login.throttled', { email: email.toLowerCase() });
          return null;
        }

        const user = await findUserForAuth(email, businessSlug);
        if (!user || !user.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Successful login: clear the attempt counter for this email+IP.
        loginLimiter.reset(throttleKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          businessId: user.businessId,
          businessSlug: user.businessSlug,
          roles: user.roles,
          permissions: user.permissions,
        };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (user?.businessId && user.id) {
        await writeAudit({
          businessId: user.businessId,
          actorUserId: user.id,
          action: 'auth.login',
          entity: 'User',
          entityId: user.id,
        });
      }
    },
  },
});

// Explicit annotations avoid pnpm's "inferred type cannot be named" (TS2742).
export const handlers: NextAuthResult['handlers'] = result.handlers;
export const auth: NextAuthResult['auth'] = result.auth;
export const signIn: NextAuthResult['signIn'] = result.signIn;
export const signOut: NextAuthResult['signOut'] = result.signOut;
