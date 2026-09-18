# Phase 24 — Testing / QA Sweep (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · Unit/integration 337 ✓ (199 core + 138 db) · **E2E 17 ✓** (14 API contract + 3 browser journeys). Total **354 automated tests**.

The platform already had strong **unit** (core) and **integration** (db, against a real Postgres)
coverage. What was missing was coverage of the seams *between* the layers — the HTTP API surface
and the actual browser experience. This phase adds a committed, repeatable **end-to-end suite** and
wires it in without any new runtime dependency.

## What was implemented

A new workspace package, **`@booking/e2e`** (`packages/e2e`), built on the tooling already in the
repo — `vitest` (used by core/db) and the `playwright` library that ships in this environment — so
**no new package was downloaded** (offline install links them from the store).

### Test server lifecycle
A vitest **global setup** ensures a web server is available for the whole suite: it reuses one if
already healthy, otherwise boots `next dev` and tears it down afterwards. A small `support.ts`
centralises the base URL, the database URL and a Chromium-executable resolver for the pre-installed
browser.

### 1. Public API + security contract (`api-contract.test.ts`, 14 tests, fetch-based)
Exercises the HTTP layer the unit/integration tests can't reach — over real HTTP against the real
database, with fixtures pulled from the seeded demo tenant:

- **`/config`** — 200 with a valid key (catalogue + theme + settings asserted), **401** without a
  key, **403** for an invalid key, and an **OPTIONS preflight** returning 204 + `*` CORS.
- **`/availability`** — 200 for a valid range, **400** for a missing `serviceId` and for malformed
  dates.
- **`/bookings`** — **201** creates a real PENDING booking (reference + status asserted), the same
  slot again → **409**, a missing `serviceId` → **400**, and an oversized body → **413**.
- **Security headers** — the home page is `SAMEORIGIN` + `nosniff`, `/login` is `DENY`
  (clickjacking), and `/book/<slug>` is `frame-ancestors *` (the widget's iframe fallback).

### 2. Browser journeys (`browser-journeys.test.ts`, 3 tests, Playwright)
The critical paths a real user takes:

- **Embeddable widget booking** — loads the demo host page, walks the whole flow
  (service → team → date/time → details → review → confirm), asserts an 8-char confirmation
  reference, **and** verifies the booking actually landed in the database as `PENDING` / `source:
  public`.
- **Admin sign-in** — the seeded admin authenticates and lands on `/admin`.
- **Auth gate** — an unauthenticated visitor to `/admin/analytics` is redirected to `/login`.

Each spec cleans up the data it creates (unique `@e2e.local` emails).

## How it runs

- `pnpm --filter @booking/e2e test:e2e` runs the whole E2E suite (server auto-managed).
- The script is deliberately named `test:e2e`, **not** `test`, so the fast unit/integration gate
  (`pnpm -r test` / `turbo run test`) is unchanged and needs no browser or web server. E2E is opt-in
  and CI-schedulable separately.
- The package is still covered by the standard `typecheck` and `lint` gates.

## Test totals

| Layer | Count |
| --- | --- |
| Unit (`@booking/core`) | 199 |
| Integration (`@booking/db`, real Postgres) | 138 |
| **E2E (`@booking/e2e`)** | **17** |
| **Total** | **354** |

## Notes / environment specifics

- The suite runs the web server on the default port 3000; in this sandbox, processes binding to a
  non-default port were terminated, so the port is fixed (overridable via `E2E_PORT` / `E2E_BASE_URL`).
- The Chromium resolver matches the versioned `chromium-<n>` install under
  `PLAYWRIGHT_BROWSERS_PATH` (ignoring the `chromium` symlink and the headless-shell variant).

## Cost / hosting policy

Fully compliant — **no new dependency** (reuses vitest + playwright already present); the harness is
pure Node (`child_process` + `fetch`) with no external service.

## Follow-ups (later)

- Wire the E2E suite into CI as a separate job (build + `next start` for a production-parity run).
- Add journeys for admin CRUD (create a service/employee, approve a booking) and customer
  self-service manage (cancel/reschedule).
- Visual-regression snapshots for the widget and key admin pages.
- Load/concurrency test the public booking endpoint against the `FOR UPDATE` guarantee at scale.
