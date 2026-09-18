import { NextResponse, type NextMiddleware } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/server/auth/config';
import { securityHeadersForPath, isProtectedPath } from '@/lib/security';

/**
 * Single edge middleware with two jobs:
 *  1. Gate the authenticated route groups (/admin, /employee) — unauthenticated
 *     requests are redirected to the login page with a return URL.
 *  2. Apply the platform's HTTP security headers to every response (see
 *     `@booking/core` security policy): MIME-sniffing, referrer, powerful-feature
 *     and framing/clickjacking protection, plus HSTS in production.
 */
const { auth } = NextAuth(authConfig);

function withSecurityHeaders(res: NextResponse, pathname: string): NextResponse {
  const headers = securityHeadersForPath(pathname, { hsts: process.env.NODE_ENV === 'production' });
  for (const [key, value] of Object.entries(headers)) res.headers.set(key, value);
  return res;
}

// Explicit annotation avoids pnpm's "inferred type cannot be named" (TS2742).
const middleware: NextMiddleware = auth((req) => {
  const { pathname, search } = req.nextUrl;

  if (isProtectedPath(pathname) && !req.auth?.user) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(url), pathname);
  }

  return withSecurityHeaders(NextResponse.next(), pathname);
}) as unknown as NextMiddleware;

export default middleware;

export const config = {
  // Run on everything except Next internals, the NextAuth API (which manages its
  // own responses) and the static widget assets served from /public.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|widget.js|widget-demo.html).*)'],
};
