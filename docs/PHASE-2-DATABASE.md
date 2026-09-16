# Phase 2 — Database / Domain (Report)

> Status: **Complete.** Migration applied · Seed ✓ · Tests 17 pass · Typecheck ✓ · Lint ✓ · Build ✓.

## What was implemented

- **`packages/core`** (framework-free domain): canonical `BookingStatus`/`PaymentStatus`
  constants + slot-occupying set, pure interval-overlap helpers, and a domain error
  taxonomy (`BookingConflictError`, `TenantIsolationError`, `ValidationError`).
- **`packages/db`** — Prisma data layer:
  - **Full schema — all 33 models** + `RolePermission`/`UserRole` joins, 8 enums.
  - **Tenant isolation:** `businessId` on every business-owned model, indexed; cascade rules set.
  - **Indexes** on `businessId`, `(businessId,startAt)`, `(businessId,status)`, `customerId`, `(employeeId,startAt)`, `serviceId`, etc.
  - **Repository abstraction** (`BaseRepository` + `Service/Customer/Booking/Business` repos) that forces `businessId` into every query — the single enforcement point for isolation. `repositoriesFor(businessId)` is the entry point.
  - **Transaction-safe `createBooking`** primitive: `FOR UPDATE` row-lock on the employee serialises concurrent attempts, then a half-open overlap check rejects conflicts — portable to Postgres and MySQL/InnoDB.
  - **Prisma client singleton** (HMR-safe).
- **Migration** `20260916152853_init` applied to local Postgres (35 tables).
- **Seed** — one isolated demo business ("Aurora Studio"): website/public key, permission catalog, Administrator + Employee roles, admin user, location + business hours, category + 2 services, 2 employees (+ services, working hours), 2 customers, 3 conflict-safe bookings, 7 email notification templates, 5 form-theme presets + a default form configuration. Idempotent.

## Database changes

- New schema with 33 domain models + 2 join tables + enums.
- First migration committed under `packages/db/prisma/migrations/`.
- Provider is `postgresql` (dev/demo); the datasource switches to `mysql` for client
  deployments — the schema is kept to a cross-dialect subset (cuid ids, no native
  arrays/partial indexes, `Decimal(10,2)`/`Json`/enums that exist on both).

## API changes

None yet — the versioned REST API is Phase 16. The data layer is consumed internally
via repositories.

## Tests performed

- **`@booking/core`** — 9 unit tests (interval overlap, back-to-back edges, conflict detection, interval validity).
- **`@booking/db`** — 8 integration tests against real Postgres:
  - free-slot booking succeeds; overlapping booking rejected; back-to-back allowed;
  - **concurrency:** two racing identical bookings → exactly one wins, one `BookingConflictError`, DB shows a single row;
  - **tenant isolation:** a scoped repository cannot read another business's booking; scoped counts see only their tenant;
  - **enum parity:** core constants match Prisma enums.
- `pnpm typecheck` 5/5 · `pnpm lint` 5/5 · `pnpm build` ✓.

## Key decisions

- **App-generated cuid IDs** and a cross-dialect type subset for MySQL/Postgres portability (validated: schema `prisma validate` clean; MySQL provider swap documented).
- **Locking strategy:** per-employee `FOR UPDATE` row lock (portable) instead of a Postgres-only partial unique index, so cancelled slots can be rebooked and MySQL is supported. The one dialect-specific statement (raw lock SQL) is isolated and commented.
- **Permissions** modelled as a global catalog; **Roles** are business-scoped.
- Booking↔payment states are independent models/enums, per the spec.

## Remaining issues / notes

- The raw lock query uses Postgres identifier quoting; the MySQL variant (backticks) is swapped when the provider changes — flagged in code for Phase 8/client bring-up.
- Availability beyond double-booking (working hours, buffers, breaks, time-off, holidays, capacity) is **Phase 8**; the schema already carries those tables.
- Repository set currently covers Service/Customer/Booking/Business; more repos are added as later phases need them.
- Auth/RBAC enforcement (using the seeded roles/permissions) is **Phase 3**; seeded users are passwordless placeholders until then.

## Next phase (Phase 3 — Auth/RBAC)

Login + sessions (Auth.js v5), password hashing for users, role/permission checks on
server actions and routes, protected route groups, and audit logging on sensitive
actions — building on the roles/permissions seeded here.
