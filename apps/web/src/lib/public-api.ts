import { NextResponse } from 'next/server';
import {
  resolveWebsiteByPublicKey,
  type ResolvedWebsite,
} from '@booking/db';
import { resolveAllowedOrigin, originAllowed, RateLimiter } from '@booking/core';
import { logger } from '@/lib/logger';

/**
 * Shared plumbing for the public embed API (`/api/v1/public/*`).
 *
 * These endpoints are unauthenticated but **key-scoped**: a third-party site
 * sends its publishable `Website.publicKey` (header `X-Public-Key` or `?key=`),
 * which resolves to exactly one business. CORS is derived from the website's
 * configured `domain`; a website with no domain is a fully public key (`*`).
 *
 * Everything here is process-local and dependency-free — no Redis, no broker —
 * so it runs on plain shared hosting per the cost/hosting policy.
 */

/** One limiter per process. Public reads are cheap; writes are stricter. */
const readLimiter = new RateLimiter({ limit: 120, windowMs: 60_000 });
const writeLimiter = new RateLimiter({ limit: 20, windowMs: 60_000 });

const PUBLIC_HEADERS = 'Content-Type, X-Public-Key';
const MAX_AGE = '600';

export function readPublicKey(request: Request, url: URL): string {
  return (request.headers.get('x-public-key') ?? url.searchParams.get('key') ?? '').trim();
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/** CORS headers for a resolved (or as-yet-unresolved) website. */
export function corsHeaders(origin: string | null, domain: string | null | undefined): Record<string, string> {
  const allow = resolveAllowedOrigin(origin, domain) ?? 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': PUBLIC_HEADERS,
    'Access-Control-Max-Age': MAX_AGE,
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): NextResponse {
  return NextResponse.json(body, { status, headers });
}

/** Consistent error envelope. */
export function apiError(
  message: string,
  status: number,
  origin: string | null,
  domain: string | null | undefined,
  code?: string,
): NextResponse {
  return json({ error: { message, code: code ?? httpCode(status) } }, status, corsHeaders(origin, domain));
}

function httpCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    default:
      return 'error';
  }
}

export interface PublicContext {
  website: ResolvedWebsite;
  origin: string | null;
}

type Guarded =
  | { ok: true; ctx: PublicContext }
  | { ok: false; response: NextResponse };

/**
 * Resolve the key, enforce CORS + rate limit, and hand back a tenant context.
 * On any failure it returns a ready-to-send response with correct CORS headers.
 */
export async function guardPublicRequest(
  request: Request,
  url: URL,
  kind: 'read' | 'write',
): Promise<Guarded> {
  const origin = request.headers.get('origin');
  const key = readPublicKey(request, url);

  if (!key) {
    return { ok: false, response: apiError('Missing public key.', 401, origin, null) };
  }

  let website: ResolvedWebsite | null;
  try {
    website = await resolveWebsiteByPublicKey(key);
  } catch (error) {
    logger.error('public.key.resolve.failed', { message: (error as Error)?.message });
    return { ok: false, response: apiError('Unable to verify key.', 500, origin, null) };
  }
  if (!website) {
    return { ok: false, response: apiError('Invalid or inactive public key.', 403, origin, null) };
  }

  // CORS: a domain-locked key rejects a browser request from a foreign origin.
  if (!originAllowed(origin, website.domain)) {
    return { ok: false, response: apiError('Origin not allowed for this key.', 403, origin, website.domain) };
  }

  // Rate limit (per key + ip + method-class).
  const limiter = kind === 'write' ? writeLimiter : readLimiter;
  const result = limiter.check(`${key}:${clientIp(request)}:${kind}`);
  if (!result.allowed) {
    const res = apiError('Too many requests. Please slow down.', 429, origin, website.domain);
    res.headers.set('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
    return { ok: false, response: res };
  }

  return { ok: true, ctx: { website, origin } };
}

/** Success JSON with the resolved website's CORS headers. */
export function apiOk(body: unknown, ctx: PublicContext, status = 200): NextResponse {
  return json(body, status, corsHeaders(ctx.origin, ctx.website.domain));
}

/**
 * Preflight handler. We don't know the key at preflight (browsers don't send
 * custom headers on OPTIONS), so we answer permissively — the actual GET/POST
 * still enforces the per-key origin rule. This lets a domain-locked key's real
 * request through the browser preflight while the request itself is validated.
 */
export function preflight(request: Request): NextResponse {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, null) });
}
