# Phase 0 — Architecture & Repository Audit

> Universal Premium Booking Platform
> Source of truth: *Universal Premium Booking — Complete Product Bible + Phase-by-Phase Claude Code Master Plan* (v2).
> Status: **Phase 0 complete. Locked decisions below approved by owner. No application code written yet.**

---

## A. Current Project Analysis

| Item | Finding |
|---|---|
| Repository | `infindigital/BookingPlatform` |
| Working branch | `claude/great-faraday-n1h976` |
| Commits at audit time | None — empty repository (only `.git/`) |
| Existing framework / dependencies | None |
| Already implemented | Nothing |
| Gap vs. spec | 100% — greenfield build |

No migration or backward-compatibility constraints. The stack is chosen cleanly per the spec.

---

## B. Proposed Architecture

Backend/API is the single source of truth. The frontend and the embeddable widget
**never** connect to the database directly. Domain logic is framework-free and lives
apart from any UI.

```
Backend/API (Next.js Route Handlers, /api/v1) = source of truth
      |
      +-- Domain core (framework-free: booking + availability + state machines)
      +-- Data layer (repository abstraction over Prisma; Postgres demo / MySQL client)
      |
      +-- Admin dashboard (Next.js App Router, RBAC-gated)
      +-- Customer booking UI + Customer panel
      +-- Employee panel
      |
      +-- Universal Widget (standalone JS SDK) -> talks ONLY to the public API
              host site (HTML / PHP / Laravel / React / WordPress / Shopify / Webflow)
```

Structurally enforced principles:

- Frontend never touches the DB — everything goes through `/api`.
- Domain logic lives in a framework-free package (`packages/core`), independently testable.
- Every business-owned row carries `businessId`, enforced centrally in the repository layer.
- Branding is configuration-driven (FormTheme / FormConfiguration / Business settings), never hard-coded.

---

## C. Proposed Folder Structure

Monorepo (pnpm workspaces + Turborepo) so the reusable engine and the widget ship
independently of the app shell.

```
BookingPlatform/
|- apps/
|  \- web/                     # Next.js app (admin + customer + employee + API)
|     |- src/app/
|     |  |- (admin)/           # dashboard, calendar, bookings, services, ...
|     |  |- (customer)/        # booking flow + customer panel
|     |  |- (employee)/        # employee workspace
|     |  |- book/              # public embeddable booking route (iframe target)
|     |  \- api/v1/            # versioned REST API (route handlers)
|     \- src/components/, hooks/, lib/
|- packages/
|  |- core/                    # framework-free domain: booking state machine,
|  |                           #   availability engine, notification events, validation
|  |- db/                      # Prisma schema, migrations, seed, repositories
|  |- ui/                      # shared premium design system (shadcn-based, tokens)
|  |- widget/                  # standalone embeddable JS SDK (widget.js) + iframe host
|  \- config/                  # eslint / tsconfig / tailwind presets
|- docs/                       # architecture, API, deployment, cost policy
|- turbo.json, pnpm-workspace.yaml, package.json
```

---

## D. Database Models (Prisma)

All 33 models from the spec, every business-owned model carrying `businessId` with
indexes on `businessId`, dates/status, `customerId`, `employeeId`, `serviceId`.

- **Tenancy / Core:** Business, Website, User, Role, Permission (+ join), AuditLog
- **Catalog:** ServiceCategory, Service, ServiceExtra, Location
- **Staff & schedule:** Employee, EmployeeService, BusinessHours, EmployeeWorkingHours, Break, Holiday, TimeOff, BlockedTime
- **Customers:** Customer, CustomerNote
- **Bookings:** Booking (status enum), BookingItem, Payment (independent payment-state enum)
- **Forms:** CustomField, CustomFieldValue, FormTheme, FormConfiguration
- **Notifications:** NotificationTemplate, NotificationJob, NotificationLog
- **Integrations:** Webhook, WebhookDelivery

**Booking state machine:** `PENDING -> ACCEPTED -> {RESCHEDULED | COMPLETED | NO_SHOW}` / `REJECTED` / `CANCELLED`.
**Payment state (independent):** `UNPAID -> PENDING -> PAID | PARTIALLY_PAID -> REFUNDED | FAILED`.
Transitions are validated in `packages/core`, never ad hoc.

**Double-booking prevention:** slot creation runs inside a DB transaction with row
locking (interactive transaction / `SELECT ... FOR UPDATE`) plus a unique constraint on
the effective (employee/resource, start, end) tuple.

---

## E. API Structure

Versioned under `/api/v1`: bookings, availability, services, employees, locations,
customers, forms, businesses, notifications, webhooks. Cross-cutting: authentication,
Zod validation, rate limiting, pagination, filtering, **idempotency keys** (booking
creation), signed webhooks, and a consistent error envelope. Two audiences:
authenticated admin/staff API and a **public booking API** scoped by business (used by
the widget with a public key).

---

## F. Authentication / RBAC

- **Sessions:** Auth.js (NextAuth v5) credentials + session cookies for admin/employee.
- **Customer access:** passwordless **expiring tokens** for the "Manage Booking" links.
- **RBAC:** DB-driven Role/Permission; server-side authorization on every action and route.
- **Tenant isolation:** each session scoped to a `businessId`; repository layer refuses
  cross-business reads/writes; optional Postgres RLS as defense-in-depth.
- **Audit logging** on sensitive actions.

---

## G. Booking Engine

Framework-free in `packages/core`: availability engine (working hours - breaks -
holidays - time-off - blocked-time - existing bookings, with buffers, capacity, and
timezone handling), the state machine, and validation. The API composes core +
repositories inside transactions. Concurrency tests are a Phase-8 deliverable.

---

## H. Notification Architecture

Event-driven around booking state changes:
`BOOKING_CREATED / ACCEPTED / REJECTED / CANCELLED / RESCHEDULED / COMPLETED / REMINDER`.
A state change enqueues a `NotificationJob`; a worker renders the template per channel
and dispatches via a provider abstraction (Email first; WhatsApp/SMS adapters ready).
Every send writes a `NotificationLog` (channel, recipient, status, provider message ID,
attempts, error) with retries + idempotency. **Queue is DB-backed** (`NotificationJob`
table + scheduled worker/cron) — portable to client shared hosting; **Redis is not a
mandatory dependency**.

---

## I. Universal Widget Architecture

Standalone `widget.js` (`packages/widget`), zero host-framework dependencies:

```html
<script src="https://booking.yourdomain.com/widget.js" defer></script>
<div data-booking-business="client-123"></div>
```

Modes: inline, popup/modal, booking button, service-specific, employee-specific, and
**iframe fallback** (the `/book` route). Talks only to the public API, scoped by
business key, CORS-controlled. Optional thin WordPress connector later (not core).

---

## J. Dependencies (introduced per phase, not all at once)

Core: next, react, typescript, tailwindcss, shadcn/ui (Radix), framer-motion,
prisma / @prisma/client, zod, next-auth, date-fns + date-fns-tz.
Tooling: turbo, pnpm, eslint, prettier, vitest, @playwright/test.
Email: provider SDK behind an abstraction (chosen in Phase 14).
No payment/SaaS-billing dependencies — payments stay abstraction-only (Phase 18).

---

## K. Risks

1. **Multi-DB (Postgres demo / MySQL client)** — Prisma provider is fixed per schema.
   Mitigation: repository abstraction + cross-dialect schema subset; validate MySQL early.
2. **Double-booking under concurrency** — needs real transaction/locking + concurrency tests.
3. **Tenant isolation leaks** — centralized `businessId` scoping + tests; optional RLS.
4. **Widget on hostile/legacy sites** — CSS/JS collisions; use Shadow DOM or iframe isolation.
5. **Queue portability on shared hosting** — DB-backed queue instead of Redis.
6. **Scope size (23 phases)** — strict phase gating; no building ahead.
7. **Timezone correctness** — store UTC, convert at edges.

---

## L. Phase Order

0 Audit -> 1 Foundation -> 2 DB/domain -> 3 Auth/RBAC -> 4 Design system/shell ->
5 Dashboard -> 6 Calendar -> 7 Booking engine -> 8 Availability -> 9 Customer booking UI ->
10 Form designer -> 11 Customer panel -> 12 Employee panel -> 13 Notifications ->
14 Email -> 15 Widget -> 16 API -> 17 Webhooks -> 18 Payments-ready ->
19 Settings/branding -> 20 Analytics -> 21 Security hardening -> 22 Automated testing ->
23 Premium UI audit.

Each phase: **Plan -> Implement -> Test -> Typecheck -> Lint -> Build -> UI review -> Fix -> Report.**

---

## M. Files Expected in Phase 1 (Foundation only)

Monorepo scaffolding: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`,
`.env.example` + env validation, `apps/web` (Next.js + TS + Tailwind + shadcn init, root
layout, error boundaries, logger), `packages/config` (eslint/tsconfig/tailwind presets),
`packages/ui` (scaffold), `docs/` (this report + cost policy), seeded demo-config
placeholder. **No domain features, schema, or auth in Phase 1** — those are Phases 2-3.

---

## Locked Decisions (owner-approved)

| # | Decision | Choice |
|---|---|---|
| D1 | DB portability | **Prisma + repository abstraction** — cross-dialect schema subset, provider switch (postgres/mysql) via env, MySQL validated early |
| D2 | Tenancy | **Shared schema + `businessId` + centrally-enforced scoping** + optional Postgres RLS |
| D3 | Auth | **Auth.js / NextAuth v5** (sessions) + DB-driven RBAC; customer panel = passwordless expiring tokens |
| D4 | Notification queue | **DB-backed `NotificationJob` + cron/worker** (no mandatory Redis) |

See `DATABASE-COST-HOSTING-POLICY.md` for the binding cost/hosting constraints that
govern all phases.
