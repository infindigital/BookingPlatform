# Phase 21 — Events (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 306 tests ✓ (174 core + 132 db) · UI reviewed (events list + editor + attendees drawer, light + dark + mobile, no horizontal overflow at 390px) · capacity enforcement verified against the database (including a concurrency race) and end-to-end through the running app (create → publish → register → seat figures update).

## What was implemented

A real **ticketed events** feature at **`/admin/events`** (gated on a new
`event.manage` permission) for group classes and workshops. An event has a
scheduled time, a **seat capacity**, a price, and an optional host + location;
staff register customers for one or more seats, and **overbooking is prevented
transactionally** — the same guarantee the booking engine gives for
double-booking.

- **Events.** Full CRUD with a status lifecycle (**Draft → Published →
  Completed**, or **Cancelled**). Each card shows the schedule (in the business
  timezone), a live capacity bar (`registered / capacity`, seats left, sold-out
  badge), host, location and price.
- **Registrations.** An attendees drawer lists every registration with its
  status and lets staff **register a customer** (searchable), for N seats, with
  an optional note — and mark each **Attended / No-show / Cancel** (or reinstate).
  Seat figures update as registrations change.
- **Capacity is enforced on the backend.** Registering more seats than remain is
  rejected with a domain `EventCapacityError`; cancelling or a no-show frees the
  seat; marking attended keeps it.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `events/`)** — pure and tested: the status unions +
  labels (`EVENT_STATUS_LABELS`, `EVENT_REGISTRATION_STATUS_LABELS`), the
  seat-occupying rule (`SEAT_OCCUPYING_STATUSES` — REGISTERED/ATTENDED hold a
  seat; CANCELLED/NO_SHOW free it), `resolveEventInput` (title / interval /
  capacity / price validation + normalisation), and the seat math
  (`occupiedSeats`, `seatsRemaining`, `canRegister`, `isSoldOut`). New
  `EventCapacityError` in the error taxonomy.
- **Data layer (`@booking/db`, `events/`)** — `EventRepository` (added to
  `repositoriesFor`), tenant-scoped throughout:
  - `register()` takes a **`FOR UPDATE` row lock on the Event** inside a
    transaction (the portable strategy `createBooking` uses), recounts occupied
    seats, and rejects an overbooking — so exactly one of two racing
    last-seat registrations wins.
  - `setRegistrationStatus()` re-checks capacity under the same lock when moving
    a freed registration back into a seat-holding status.
  - CRUD + a booking-safe `delete` (an event with registrations must be
    cancelled, not deleted). `read.ts` shapes the list + detail read models with
    computed seat figures.
- **App layer** — `event.manage`-gated, audited server actions (create / update /
  status / delete / register / registration-status / customer search); the
  `/admin/events` page and the `EventsWorkspace` with an event editor and an
  attendees drawer. Event times are entered as a date + start/end in the
  business timezone and stored as instants via `wallTimeToInstant`.

## Database changes

One migration (`events`):

- New enums `EventStatus` (DRAFT/PUBLISHED/CANCELLED/COMPLETED) and
  `EventRegistrationStatus` (REGISTERED/CANCELLED/ATTENDED/NO_SHOW).
- New model **`Event`** (title, description, start/end, capacity, price,
  currency, optional location + host, status).
- New model **`EventRegistration`** (event, customer, seats, status, note).
- Relations added to Business, Location, Employee and Customer.
- Seed: added the **`event.manage`** permission (granted to Administrator).

## Tests performed

- **Domain (core)** — `events/events.test.ts` (8): input validation +
  normalisation, and the seat math (occupying vs. freed statuses, remaining,
  sold-out, `canRegister` gating). Core suite: **174 tests**.
- **Integration (db)** — `events.test.ts` (10) against the real database: create
  + list with seat figures; register + remaining tracking; **overbooking
  rejected**; a cancelled registration frees a seat and a new one succeeds;
  marking attended keeps the seat; **cannot register into a cancelled event**;
  a **concurrency race for the last seat** (exactly one of two racers wins, the
  other gets `EventCapacityError`); the delete guard; and **tenant isolation**.
  DB suite: **132 tests** (**306** total).
- **End-to-end (running app)** — signed in as the admin: created a
  "Sunset Yoga Workshop" (capacity 3), published it, opened the attendees
  drawer, searched for a customer and registered them — the seat figures moved
  to 1/3 (2 left) and the capacity bar filled. Demo events cleaned afterwards.

## UI review

Screenshots at desktop (light + dark) and mobile (390px, no horizontal overflow):
the events list with capacity bars and status actions, the event editor drawer
(date + time, capacity, price, host, location, status), and the attendees drawer
(seat figures, searchable register form, per-registration actions).

## Cost / hosting policy

Fully compliant — no new dependency, `Intl` for date/money formatting (no date
library), all validation + capacity enforcement server-side, and everything
portable across Postgres (dev) and MySQL/MariaDB (clients). The capacity lock
uses a plain `SELECT … FOR UPDATE`, supported by both dialects.

## Security notes

- **Capacity is server-authoritative** and enforced inside the locking
  transaction; the client cannot overbook.
- **Tenant isolation** on every read/write, including a scoped `FOR UPDATE`
  (`… AND "businessId" = …`) so a lock can never cross tenants.
- **RBAC + audit.** All event reads/writes require `event.manage`; every mutation
  is written to the audit log.

## Scope note / follow-ups (later phases)

- **Event payments through the ledger.** Events carry a price (shown + available
  to analytics), but collecting it reuses the Phase-18 ledger, which is currently
  keyed to a `bookingId`. Decoupling `Payment` so a registration can own one is
  the natural next step.
- **Public event registration** via the widget (self-service), reusing this
  capacity engine.
- **Event reminders** as a notification event, reusing the Phase 14/15 engine.
- **Waitlists** when an event is sold out.
