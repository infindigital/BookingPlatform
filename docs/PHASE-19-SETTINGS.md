# Phase 19 — Settings (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 273 tests ✓ (156 core + 117 db) · UI reviewed (General / Locations / Opening hours / Closures, light + dark + mobile, no horizontal overflow at 390px) · full settings → engine pipeline verified against the database, including a live end-to-end edit through the running app (opening hours + a closure saved and reloaded from the DB).

## What was implemented

A real business **configuration hub** at **`/admin/settings`** (gated on the
existing `settings.manage` permission), with four tabs — each writes data the
platform actually consumes, not cosmetic fields:

- **General — business profile.** Name, timezone, currency, contact email and
  phone. The timezone drives availability + the calendar, the currency drives
  payment display, and the contact details appear on customer notifications.
  Validated and normalised in pure-core code (name required, timezone checked
  against the runtime's IANA list via `Intl`, currency to a 3-letter code,
  email format-checked).
- **Locations.** Full CRUD: name, address, an optional per-location timezone
  override (inherits the business zone when blank), and an active/inactive
  toggle. A location that still has bookings **cannot be hard-deleted** — the
  UI steers you to deactivate instead, preserving booking history.
- **Opening hours.** A weekly editor (Sunday→Saturday, open/closed + a time
  window per day) that is **wired into the availability engine** as an outer
  boundary: bookable slots are clipped to the open window, and a business-closed
  weekday yields no availability. It is **backward-compatible** — a business
  with no hours configured is unconstrained, exactly as before.
- **Closures.** Holiday/closed-day CRUD (name, date, optional yearly repeat).
  These were **already enforced** by the availability engine; the UI now lets a
  business manage them. Dates are stored at local-midnight in the business
  timezone so the engine's day matching stays correct in every zone.

No new dependency and **no database migration** — every model
(`Business`, `Location`, `BusinessHours`, `Holiday`) and both permissions
(`settings.manage`, `analytics.read`) already existed in the schema/seed; this
phase implements the domain logic, engine wiring and UI on top of them.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `settings/`)** — pure and tested:
  - `profile.ts` — `resolveBusinessProfile` (+ `isValidTimeZone` via `Intl`).
  - `location.ts` — `resolveLocationInput`.
  - `hours.ts` — `parseHHMM` / `minutesToHHMM`, `resolveWeeklyHours` (canonical
    7-day week for the editor), `toStorableHours`, and
    `buildBusinessHoursConstraint` — the outer-boundary the engine applies.
  - `availability/intervals.ts` — a new pure `intersectSpans` used to clip a
    resource's windows to the opening hours.
- **Data layer (`@booking/db`, `settings/`)** — `SettingsRepository` (added to
  `repositoriesFor`), tenant-scoped throughout: business profile, location CRUD
  (+ the booking-guarded delete), atomic weekly-hours replace, and holiday CRUD
  (with tz-correct date storage). Profile/location input is validated through the
  same core resolvers.
- **Availability engine (`@booking/db`, `availability/availability.ts`)** — now
  loads the business-wide opening hours, builds the constraint, skips closed
  weekdays, and intersects each employee's windows with the open windows. Inert
  when no hours are set.
- **App layer** — `settings.manage`-gated, audited server actions
  (`settings.profile.update`, `settings.location.*`, `settings.hours.update`,
  `settings.holiday.*`); the `/admin/settings` workspace and its four editors.
  Timezone/currency option lists are computed server-side from
  `Intl.supportedValuesOf` (no dependency, no client fetch).

## Database changes

**None.** The migration count is unchanged from Phase 18.

## Tests performed

- **Domain (core)** — `settings/settings.test.ts` (18): HH:mm parse/format,
  weekly-hours resolution + repair + storable filtering, the business-hours
  constraint (open windows vs. closed days, split hours, open-wins-over-closed),
  `intersectSpans` (overlap, multiple/disjoint, empty), profile resolution +
  validation (name/timezone/email) and `isValidTimeZone`, and location
  resolution + validation. Core suite: **156 tests**.
- **Integration (db)** — `settings.test.ts` (11) against the real database:
  profile update + normalisation + rejection; location create/list/update/
  deactivate, the delete guard (blocks a location with bookings, allows an
  unused one), and tenant scoping; weekly-hours replace + reload; holiday tz
  correctness in a behind-UTC zone, plus date/name validation, update and
  delete; and **three availability-engine tests** — opening hours clip the
  bookable window, a closed weekday yields nothing, and no configured hours
  leaves availability unchanged. DB suite: **117 tests** (**273** total). The
  pre-existing availability tests still pass unchanged.
- **End-to-end (running app)** — signed in as the admin: opened each tab, then
  set Monday to 10:00–14:00 and saved (the value round-tripped through the DB and
  reloaded), and added a closure ("Review Day Off", Dec 24 2031) that appeared in
  the list. Demo artifacts cleaned afterwards.

## UI review

Screenshots at desktop (light + dark) and mobile (390px, no horizontal overflow
on any tab): the profile form, the locations list with status badges + the
editor drawer, the weekly opening-hours editor (per-day open toggle + time
inputs, disabled when closed), and the closures list + editor. Tabs scroll
horizontally on narrow screens.

## Cost / hosting policy

Fully compliant — no new dependency, `Intl` for timezone/currency lists and
date formatting (no date library), all validation server-side, and everything
portable across Postgres (dev) and MySQL/MariaDB (clients).

## Security notes

- **Server-authoritative + validated.** Profiles, locations, hours and holidays
  are all validated/normalised on the backend through the pure-core resolvers.
- **Tenant isolation.** Every read/write is businessId-scoped; a cross-tenant
  update affects zero rows (covered by a test).
- **RBAC + audit.** All settings reads/writes require `settings.manage`; every
  mutation is written to the audit log.

## Scope note

**Events** (ticketed group classes) shares the "phase 19" nav slot but has no
schema and is a distinct, sizeable domain; it is intentionally deferred to its
own phase rather than half-built here.

## Follow-ups (later phases)

- **Per-location opening hours** surfaced in the UI (the data layer already keys
  on `locationId`; the engine currently applies the business-wide set).
- **Events** — group/class bookings with capacity + ticketing (its own phase).
- **Role & team management** UI on top of the existing RBAC tables.
