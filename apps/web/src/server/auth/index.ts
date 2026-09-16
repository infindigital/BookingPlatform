import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { findUserForAuth, verifyPassword, writeAudit } from '@booking/db';
import { authConfig } from './config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  businessSlug: z.string().optional(),
});

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
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password, businessSlug } = parsed.data;
        const user = await findUserForAuth(email, businessSlug);
        if (!user || !user.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

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
