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
  session: { strategy: 'jwt' },
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
