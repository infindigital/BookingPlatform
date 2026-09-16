# Phase 7 — Booking Engine (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 66 tests ✓ · UI reviewed (list / detail / create, light + dark + mobile) · create + conflict + approve verified end-to-end.

## What was implemented

The full booking lifecycle, and the Bookings management screen at `/admin/bookings`
(replacing the placeholder).

- **Status state machine** (`@booking/core`) — the single source of truth for legal
  transitions (PENDING → ACCEPTED/REJECTED/CANCELLED/RESCHEDULED; ACCEPTED →
  COMPLETED/NO_SHOW/CANCELLED/RESCHEDULED; RESCHEDULED → …; four terminal states).
  Exposes `canTransition`, `availableActions`, `isReschedulable`, and a semantic
  action table (each action → target status + required permission). The dashboard,
  calendar and bookings screen all drive their controls from it.
- **Bookings list** — faceted status tabs with live counts, search (customer/
  service), team-member and time (all / upcoming / past) filters, a sortable table,
  and pagination. All server-rendered from tenant-scoped, URL-driven filters.
- **Booking detail drawer** — full read context plus **contextual, permission-gated
  actions** generated from the state machine (Approve/Reject need `booking.approve`;
  Complete/No-show/Cancel/Reschedule need `booking.write`). A read-only user sees no
  actions. The open drawer stays in sync with refreshed data after an action.
- **Reschedule** — inline form (date/time/team member) that re-validates against
  double-booking and surfaces conflicts; sets status RESCHEDULED.
- **Create booking** (admin) — a drawer form: existing or quick-created customer,
  service (with duration/price), team member (filtered to those who offer the
  service), location, date/time, notes. Confirmed on creation; conflicts rejected.

## Architecture / where the logic lives

- **Domain rules in the layers that own them.** The state machine is pure and lives
  in `@booking/core`; the data layer (`@booking/db`) asserts against it before every
  write, so an illegal or self transition can never be persisted.
- **`transitionBooking`** — tenant-scoped, transactional status change guarded by
  `canTransition` (replaces Phase 5's ad-hoc `allowedFrom`; the dashboard actions now
  route through it).
- **`rescheduleBooking`** — transactional move with the same `FOR UPDATE` employee
  lock + overlap check used on create, excluding the booking itself.
- **Read models** — `getBookingsList` (filters + pagination + status facets) and
  `getBookingFormData` (services/employees/locations/customers) keep all queries
  tenant-scoped and off the client.
- **Server actions** (`apps/web/src/server/bookings/actions.ts`) — a generic
  `bookingAction` (resolves the action's target + permission from core), plus
  `rescheduleBookingAction` and `createBookingAction` (React `useActionState`, so
  validation/conflict errors return to the form). Every mutation checks the
  permission, writes an **audit** row, and revalidates.
- **`wallTimeToInstant`** timezone helper turns the admin's local date/time input
  into a UTC instant.

## Database changes

None to the schema. (No new tables — the engine operates on the existing `Booking`
model and its indexes.)

## Tests performed

- **Unit (core)** — `transitions.test.ts` (7): legal/illegal/self transitions,
  terminal states, reschedulability, action availability + permission mapping,
  and coverage of every status.
- **Integration (db)** — `booking-engine.test.ts` (5): `transitionBooking` legal +
  illegal + cross-tenant; `rescheduleBooking` move → RESCHEDULED, same-employee
  collision → `BookingConflictError` (self-excluded), terminal booking refused.
- Full suite: **66 passing** (was 54). `pnpm typecheck` 5/5 · `pnpm lint` 5/5 ·
  `pnpm build` ✓ (`/admin/bookings` dynamic).
- **UI review** (headless Chromium, real login): list, detail drawer with actions,
  create form, light + dark + mobile.
- **End-to-end (real browser + DB assertions):**
  - **Create** — the admin form created a booking (verified in DB: ACCEPTED,
    `source: 'admin'`, correct time) with a `booking.create` audit row; list count
    6 → 7.
  - **Double-booking prevention** — creating a second booking for a busy employee at
    an occupied time was rejected with "The requested time slot is no longer
    available." (no row written).
  - **Approve** — approving a pending booking transitioned it PENDING → ACCEPTED in
    the DB with a `booking.approve` audit row.

## Key decisions

- **State machine as one source of truth** — the UI can't offer an action the domain
  would reject, and the domain can't be bypassed by the UI.
- **Real, guarded mutations** everywhere (no fake controls); each is permission-gated
  and audited.
- **Admin-created bookings are confirmed** (`ACCEPTED`, `source: 'admin'`); the
  PENDING approval workflow is exercised by widget/customer bookings (later phases).
- **`useActionState` for create/reschedule** so conflict/validation errors return to
  the form; benign status actions stay fire-and-refresh.
- **Availability not pre-empted** — the admin picks a time and the backend prevents
  double-booking; working-hours/buffers/time-off slot generation is Phase 8.

## Remaining issues / notes

- The create form lets the admin pick any time (with conflict prevention); it does
  not yet restrict to available slots — that is the availability engine (Phase 8).
- Editing fields other than time/employee (service, price overrides) can be added
  with the customer/settings work; the drawer is the entry point.
- Notification-on-transition remains deferred to Phase 12/13 (hooks marked in the
  domain ops).

## Next phase (Phase 8 — Availability engine)

Slot generation from working hours, service duration + buffers, capacity, time-off,
blocked times and holidays — feeding both the admin create form and the upcoming
customer booking UI.
