/**
 * CORS origin matching for the public embed API.
 *
 * A published `Website` may declare a `domain` (e.g. "shop.acme.com"). When it
 * does, browser requests carrying an `Origin` are allowed only from that host
 * (and its `www.` variant), on either scheme. When a website declares no domain,
 * the key is treated as fully public — any origin may embed it — which is what
 * the demo and "paste anywhere" onboarding need.
 *
 * This is pure host comparison: no network, no allocation beyond parsing. The
 * value returned by `resolveAllowedOrigin` is what belongs in the
 * `Access-Control-Allow-Origin` response header.
 */

/** Extract the lowercased host (no port) from an Origin/URL string. */
export function originHost(origin: string): string | null {
  const value = origin.trim();
  if (!value || value === 'null') return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/** Normalise a configured domain to a bare lowercased host (tolerates a pasted URL). */
export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return null;
  // Accept "https://host/path", "host:443" or a bare "host".
  const host = originHost(trimmed) ?? originHost(`https://${trimmed}`);
  return host;
}

/**
 * Is `origin` permitted for a website configured with `domain`?
 * - No configured domain → any origin is allowed (fully public key).
 * - A request with no Origin (server-to-server, curl) → allowed; CORS only
 *   constrains browsers, and the key already scopes the tenant.
 * - Otherwise the origin host must equal the domain, or be its `www.` variant
 *   (or vice-versa).
 */
export function originAllowed(origin: string | null | undefined, domain: string | null | undefined): boolean {
  const configured = normalizeDomain(domain);
  if (!configured) return true;
  if (!origin) return true;
  const host = originHost(origin);
  if (!host) return false;
  if (host === configured) return true;
  const bare = (h: string) => (h.startsWith('www.') ? h.slice(4) : h);
  return bare(host) === bare(configured);
}

/**
 * The value for `Access-Control-Allow-Origin`. When a domain is configured we
 * echo the specific allowed origin (never a wildcard, so it composes with
 * credentials if ever needed); when it is open we return `*`. Returns `null`
 * when the origin is present but not allowed — the caller should reject.
 */
export function resolveAllowedOrigin(
  origin: string | null | undefined,
  domain: string | null | undefined,
): string | null {
  const configured = normalizeDomain(domain);
  if (!configured) return '*';
  if (!origin) return '*';
  return originAllowed(origin, domain) ? origin : null;
}
