import NextAuth, { type NextAuthResult } from 'next-auth';
import { authConfig } from '@/server/auth/config';

// Edge-safe middleware: runs the `authorized` callback to gate protected routes.
// Explicit annotation avoids pnpm's "inferred type cannot be named" (TS2742).
const middleware: NextAuthResult['auth'] = NextAuth(authConfig).auth;
export default middleware;

export const config = {
  // Protect the admin (and future employee) areas; skip static assets + auth API.
  matcher: ['/admin/:path*', '/employee/:path*'],
};
