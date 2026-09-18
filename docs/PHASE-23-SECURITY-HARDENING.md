# Phase 23 — Security Hardening (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 337 tests ✓ (199 core + 138 db) · headers verified live per route · login + widget flows re-verified end-to-end.

A defense-in-depth pass over the platform. Rather than bolt on features, it hardens the
surfaces built in earlier phases and documents the whole posture in a top-level `SECURITY.md`.

## What was already in place (verified, not re-done)

RBAC + audit logging, strict `businessId` tenant isolation, transaction row-locks preventing
double-booking / overbooking, webhook HMAC signing + SSRF guard, secret-gated cron endpoints,
startup env validation, bcrypt password hashing, and the public-API key scoping + CORS + rate
limiting from Phase 22.

## What this phase added

### 1. HTTP security headers (every response)
A pure, tested policy in `@booking/core` (`security/headers.ts`) applied by the web middleware:

- Baseline on all responses: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` disabling
  camera/microphone/geolocation/topics, and `Strict-Transport-Security` in production.
- A **per-route clickjacking policy** via `X-Frame-Options` + CSP `frame-ancestors`:
  - `DENY` on `/admin`, `/employee` and `/login`,
  - **embeddable** (`frame-ancestors *`, no `X-Frame-Options`) on `/book/*` — the widget's
    iframe fallback must be embeddable,
  - `SAMEORIGIN` everywhere else.

Verified live: `/` → SAMEORIGIN; `/login` → DENY; `/book/aurora` → `frame-ancestors *`;
`/admin` → 307 → `/login?callbackUrl=%2Fadmin` (gating intact); public API → baseline headers;
`/widget.js` still served (matcher-excluded).

> A full `script-src` CSP with nonces is deliberately deferred (it needs per-request nonce
> plumbing through Next's inline bootstrap); the `frame-ancestors` directive shipped now is the
> clickjacking-relevant control and is safe without nonces.

### 2. Login brute-force throttling
The credentials `authorize` path now throttles attempts per **email + IP** using the core
`RateLimiter` (in-process, no Redis): 8 attempts / 15 min, checked **before** any DB or bcrypt
work so brute force is cheap to deny. A successful login clears the counter, so a legitimate
user who mistypes is not locked out. Throttled attempts are logged.

### 3. Public-API input hardening
- **Body-size cap** on `POST /bookings` — declared (`Content-Length`) and actual body are both
  checked against an 8 KB ceiling → `413` before parsing.
- **Field-length caps** in `createPublicBooking` (name ≤ 100, email ≤ 200, phone ≤ 40,
  notes ≤ 2000) → `ValidationError` (400) before anything is written.

Verified live: valid booking → 201; a 9 KB body → 413; an over-long `notes` field → 400.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `security/`)** — pure, edge-safe: `buildSecurityHeaders({frame,hsts})`
  and `framePolicyForPath(pathname)`, plus the baseline-header constant. Fully unit-tested.
- **App layer** — `src/lib/security.ts` maps a pathname to its header set and exposes
  `isProtectedPath`; `src/middleware.ts` applies headers to every response and gates the
  authenticated route groups in one place. `src/server/auth/index.ts` adds the login throttle.
- **Data layer** — the field-length caps live next to the rest of the public-booking validation
  in `packages/db/src/public/create-public-booking.ts`; the route enforces the body-size cap.

## Database changes

None.

## Tests performed

- **Domain (core)** — `security/security.test.ts` (9): `framePolicyForPath` (admin/employee/login
  deny, `/book` embeddable, same-origin default, lookalike prefixes not matched) and
  `buildSecurityHeaders` (baseline always present, each framing policy's headers, HSTS gated).
  Core suite: **199 tests**.
- **Integration (db)** — added an oversized-input rejection case to `public-booking.test.ts`.
  DB suite: **138 tests** (**337** total).
- **End-to-end (running app)** — security headers curled on `/`, `/login`, `/book/aurora`,
  `/admin` (redirect), the public API, and `/widget.js`; a real booking still succeeds through the
  API; oversized body → 413 and over-long field → 400; a normal admin login still authenticates
  (throttle resets on success); demo data cleaned afterwards.

## UI review

No new UI. The header changes were verified at the HTTP layer; the admin login and the embeddable
widget were re-exercised in a browser to confirm nothing regressed (login redirects to `/admin`;
the widget still loads and books).

## Cost / hosting policy

Fully compliant — no new dependency; the throttle and header policy are in-process and pure; runs
on plain shared hosting.

## Security notes / follow-ups (later phases)

- **Nonce-based CSP** (`script-src`/`style-src`) for full XSS hardening — needs nonce plumbing
  through the Next layout.
- **Distributed rate-limit / throttle store** for multi-instance deployments (the current guards
  are per-process by design and per the no-Redis policy).
- **Account lockout + notification** on repeated failed logins, and optional 2FA.
- **Automated dependency / secret scanning** in CI.
