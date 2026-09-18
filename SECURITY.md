# Security

This document describes the security posture of the Booking Platform. Security is
built in layers ("defense in depth"): no single control is trusted alone.

## Principles

- **The backend is the source of truth.** The frontend and the embeddable widget
  never talk to the database; they call the API, which re-resolves the tenant and
  re-validates every request. Nothing the client sends is trusted.
- **Strict tenant isolation.** Every record carries a `businessId`. The repository
  layer scopes all reads and writes to the current tenant, and cross-tenant access
  is refused. Even row locks are tenant-scoped (`… AND "businessId" = …`).
- **Least privilege.** Admin/staff actions require an authenticated session and a
  specific RBAC permission; sensitive actions are written to an audit log.

## Authentication & sessions

- **Auth.js (NextAuth v5)** with a Credentials provider; passwords are hashed with
  **bcrypt** (never stored or logged in plaintext). Session strategy is JWT, signed
  with `AUTH_SECRET` (required in production).
- **Brute-force throttling.** Login attempts are rate-limited per email+IP
  (in-process, no external store); the counter clears on a successful login, so a
  legitimate user who mistypes is not locked out.
- **Route gating.** Middleware redirects unauthenticated requests to `/admin` and
  `/employee` to the login page.

## Authorization

- **RBAC** — database-driven roles and permissions, enforced server-side on every
  admin action and server action (`requirePermission`). The UI never decides access.
- **Audit logging** on sensitive mutations (who, what entity, when).

## Booking integrity

- **No double-booking / overbooking.** Booking and event-registration writes run
  inside a transaction with a per-employee / per-event `SELECT … FOR UPDATE` row
  lock, then re-check availability/capacity before inserting. Two racing requests
  for the last slot cannot both win (covered by concurrency tests).

## Public embed API (`/api/v1/public/*`)

- **Publishable-key scoping.** A publishable `Website.publicKey` identifies a
  business; it is not a secret and grants only reading the public catalogue /
  availability and *requesting* a PENDING booking. All authorization and validation
  are server-side.
- **CORS per website.** A business can lock its key to its own domain (apex + `www`);
  a domain-less key is intentionally public ("paste anywhere").
- **Rate limiting** per key + IP (tighter on writes than reads).
- **Input hardening.** POST bodies are size-capped (413) and individual fields are
  length-capped before they reach the database.

## HTTP security headers

Applied by middleware to every response (`@booking/core` security policy):

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` disabling camera, microphone, geolocation, topics/FLoC
- `Strict-Transport-Security` in production
- **Clickjacking policy** via `X-Frame-Options` + CSP `frame-ancestors`:
  - `DENY` on the admin/employee console and login page,
  - **embeddable** (`frame-ancestors *`) on the public `/book` page (the widget's
    iframe fallback),
  - `SAMEORIGIN` everywhere else.

> Note: a full `script-src`/`style-src` CSP (with per-request nonces) is a planned
> future hardening step; today we ship the `frame-ancestors` directive, which is the
> clickjacking-relevant control and is safe without nonces.

## Outbound requests (webhooks)

- Webhook payloads are **HMAC-signed** so receivers can verify authenticity.
- **SSRF guard**: webhook targets must be HTTPS public hosts; `http://` and private
  hosts are refused unless `WEBHOOKS_ALLOW_INSECURE=true` (dev/test only).

## Secrets & configuration

- Server environment is **validated at startup**; DB credentials, SMTP credentials
  and signing secrets stay server-side and are never sent to the client.
- Cron endpoints (notifications, webhooks) are **secret-gated** and return 404 when
  their secret is unset, so they can never be triggered anonymously.

## Reporting a vulnerability

This is a template deployment. For a production install, add a private contact
(security@yourdomain) and a disclosure policy here.
