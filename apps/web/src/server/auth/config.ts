import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js configuration.
 *
 * Contains NO database or bcrypt access so it can run in the middleware (edge)
 * runtime. The Credentials provider (which touches the DB) is added in
 * `./index.ts`, which runs in the Node runtime. Session strategy is JWT because
 * the Credentials provider requires it.
 */
const PROTECTED_PREFIXES = ['/admin', '/employee'];

export const authConfig: NextAuthConfig = {
  // JWT sessions with a short, rolling lifetime. Without an explicit maxAge,
  // Auth.js keeps a session valid for 30 days, so an abandoned login on a
  // shared office computer stays signed in for weeks. A 2-hour window that
  // refreshes as the user stays active behaves like a 2-hour idle timeout: the
  // session extends while someone is working, then expires ~2 hours after the
  // last activity. To make it stricter, drop maxAge to 1 * 60 * 60 (1 hour).
  // Users on shared machines should still use "Sign out" to end a session
  // immediately.
  session: {
    strategy: 'jwt',
    maxAge: 2 * 60 * 60, // expire ~2 hours after the last activity
    updateAge: 15 * 60, // refresh the token at most every 15 min of activity
  },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [], // real providers added in ./index.ts (Node runtime)
  callbacks: {
    /** Gate protected route groups for the middleware. */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (!isProtected) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.businessId = user.businessId;
        token.businessSlug = user.businessSlug;
        token.roles = user.roles;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.businessId = token.businessId as string;
      session.user.businessSlug = token.businessSlug as string;
      session.user.roles = (token.roles as string[]) ?? [];
      session.user.permissions = (token.permissions as string[]) ?? [];
      return session;
    },
  },
};
