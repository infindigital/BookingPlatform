# Phase 11 — Customers (Admin CRM) (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 116 tests ✓ (68 core + 48 db) · UI reviewed (list + profile, light + dark + mobile) · create / edit / note verified end-to-end.

> Scope note: you chose **"Both, admin CRM first."** This phase delivers the
> **staff-facing Customers CRM** (the `/admin/customers` nav item, Phase 11 in the
> app's own map). The **customer self-service panel** (public, manage-your-own-
> bookings) is the following phase.

## What was implemented

The Customers workspace at `/admin/customers` (replacing the placeholder) — a
searchable directory and a full per-customer profile.

- **Directory** — searchable (name / email / phone), paginated table with each
  customer's avatar, contact, total bookings, an "upcoming" badge, last visit
  (relative) and **lifetime spend**.
- **Profile drawer** (loaded on demand) — contact links, stat cards (bookings,
  completed, upcoming, lifetime value), **split booking history** (upcoming vs.
  past, each with its service colour, staff, time and status badge), and **staff
  notes** with author attribution.
- **Create / edit customer** — a drawer form with validation and duplicate-email
  guarding; creating a customer opens their new profile.
- **Add note** — internal notes attributed to the signed-in staff user, appended
  live without leaving the drawer.

## Architecture / where the logic lives

- **Read models in `@booking/db`** (`customers/`):
  - `getCustomersList` — tenant-scoped, searchable, paginated; aggregates each
    customer's booking count, upcoming count, completed count, last visit and
    lifetime spend (completed bookings) in a single follow-up query, not N+1.
  - `getCustomerDetail` — profile + lifetime stats + split upcoming/past history +
    notes, resolving note authors to their user names. Returns null for an unknown
    or cross-tenant id.
- **Repository** — `CustomerRepository` gained `count`, `create`, `update`,
  `addNote` and `listNotes`, all routed through the `scope()` tenant guard; search
  now also matches phone.
- **Server actions** (`apps/web/src/server/customers/actions.ts`) — `loadCustomerDetail`
  (on-demand profile), `createCustomerAction`, `updateCustomerAction`,
  `addCustomerNoteAction`. All gated on **`customer.manage`**, all audited, all
  validating input (and duplicate email) server-side. The web app never imports
  Prisma or touches the DB directly — it goes through the db package.
- **UI** (`components/customers/`) — `customers-workspace` (URL-driven search +
  pagination, mirrors the Bookings pattern), `customer-detail-drawer` (profile +
  live note add), `customer-form-drawer` (create/edit via `useActionState`).

## Database changes

None to the schema — uses the existing `Customer`, `CustomerNote`, `Booking` and
`User` models. The **seed** gained three past **completed** bookings and a customer
note so the CRM demonstrates real history and lifetime value.

## Tests performed

- **Integration (db)** — `customers.test.ts` (5): `getCustomersList` aggregates
  (counts, upcoming, lifetime spend, last visit) and search by name/email/phone +
  pagination; `getCustomerDetail` returns the profile, split history, stats and
  notes with resolved author, and null for an unknown id. DB suite: **48 tests**
  (**116** total).
- **End-to-end (browser + DB)** — logged into `/admin/customers`: the list showed
  correct aggregates (Mia $180 lifetime / 2 completed, Liam $60); the profile drawer
  rendered stats, split upcoming/history with status badges, and notes attributed to
  "Avery Admin"; adding a note appended it live; creating **Ada Lovelace** persisted
  the record (DB-verified) and opened her new profile. Re-seeded to the clean demo
  state afterward.

## UI review

Screenshots at desktop (light + dark) and mobile (390px): a clean directory table
(columns collapse gracefully on small screens) and a rich profile drawer whose stat
cards reflow 2×2 on mobile. Consistent with the Bookings/Calendar admin pattern; no
horizontal overflow on mobile.

## Cost / hosting policy

Fully compliant — no new dependencies, no date library, no external services, no raw
SQL, no schema changes. Portable across Postgres (dev) and MySQL/MariaDB (clients).

## Follow-ups (next phase)

- **Customer self-service panel** (the second half of your choice): a public,
  no-login area for a customer to look up and manage their **own** bookings (by
  email + reference / magic link) — reusing this phase's read models and the Phase 9
  public flow.
