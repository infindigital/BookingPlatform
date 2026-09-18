/**
 * HTTP security headers — pure, framework-free, edge-safe.
 *
 * The web layer applies these in middleware; keeping the policy here makes it
 * unit-testable and keeps one source of truth for the platform's browser
 * hardening. Two concerns are separated:
 *
 *  - a baseline every response gets (MIME-sniffing, referrer, powerful-feature
 *    and, in production, transport-security), and
 *  - a per-route framing (clickjacking) policy, because the product deliberately
 *    has BOTH surfaces that must never be framed (the admin app) and a surface
 *    that must be embeddable anywhere (the public `/book` page used as the
 *    widget's iframe fallback).
 *
 * We intentionally do NOT emit a full `script-src`/`style-src` Content-Security-
 * Policy here: Next.js relies on inline bootstrap scripts and the UI uses inline
 * styles, so a strict CSP needs per-request nonce plumbing (a later hardening
 * step). We DO emit the `frame-ancestors` CSP directive, which governs
 * clickjacking and is safe to set without nonces.
 */

/** How a given route may be embedded in a frame. */
export type FramePolicy = 'deny' | 'sameorigin' | 'embeddable';

export interface SecurityHeaderOptions {
  frame: FramePolicy;
  /** Emit HSTS (only meaningful over HTTPS — enable in production). */
  hsts?: boolean;
}

/** Baseline headers applied to every response, independent of framing. */
export const BASELINE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'off',
  // Disable powerful features the app never uses; browsers deny them to the
  // page and any embed. `interest-cohort` opts out of FLoC.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
};

const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

function frameHeaders(policy: FramePolicy): Record<string, string> {
  switch (policy) {
    case 'deny':
      return { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" };
    case 'sameorigin':
      return { 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "frame-ancestors 'self'" };
    case 'embeddable':
      // No X-Frame-Options (it cannot express "any origin"); the CSP directive
      // explicitly allows embedding anywhere, which the iframe fallback needs.
      return { 'Content-Security-Policy': 'frame-ancestors *' };
    default:
      return {};
  }
}

/** Build the complete header set for a response given its framing policy. */
export function buildSecurityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = { ...BASELINE_SECURITY_HEADERS, ...frameHeaders(options.frame) };
  if (options.hsts) headers['Strict-Transport-Security'] = HSTS_VALUE;
  return headers;
}

/** Route prefixes that must never be framed and require an authenticated user. */
export const NEVER_FRAMED_PREFIXES = ['/admin', '/employee'] as const;

/**
 * Decide the framing policy for a pathname.
 * - Admin / employee console and the login page → `deny` (anti-clickjacking).
 * - The public booking page `/book/*` → `embeddable` (widget iframe fallback).
 * - Everything else → `sameorigin` (safe default).
 */
export function framePolicyForPath(pathname: string): FramePolicy {
  if (pathname === '/login') return 'deny';
  for (const p of NEVER_FRAMED_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return 'deny';
  }
  if (pathname === '/book' || pathname.startsWith('/book/')) return 'embeddable';
  return 'sameorigin';
}
