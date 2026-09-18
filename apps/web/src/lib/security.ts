import { buildSecurityHeaders, framePolicyForPath, NEVER_FRAMED_PREFIXES } from '@booking/core';

/**
 * Web adapter over the pure security-header policy in `@booking/core`. Runs in
 * the edge middleware, so it stays dependency-free.
 */

/** Route groups that require an authenticated session. */
export const PROTECTED_PREFIXES = NEVER_FRAMED_PREFIXES;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The security headers to apply to a response for `pathname`. */
export function securityHeadersForPath(pathname: string, opts?: { hsts?: boolean }): Record<string, string> {
  return buildSecurityHeaders({ frame: framePolicyForPath(pathname), hsts: opts?.hsts });
}
