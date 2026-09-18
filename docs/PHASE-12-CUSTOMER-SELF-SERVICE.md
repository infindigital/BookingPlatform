# Phase 12 — Customer Self-Service Panel (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 123 tests ✓ (68 core + 55 db) · UI reviewed (lookup + manage, light + dark + mobile) · reschedule + cancel verified end-to-end against the DB.

> This completes the second half of the "Both, admin CRM first" choice: the
> **public, customer-facing** area for managing one's own bookings.

## What was implemented

A public self-service area at **`/book/[slug]/manage`** where a customer looks up
and manages their **own** bookings — no account required.

- **Ownership by (email + reference).** Email infrastructure arrives in a later
  phase, so verification uses the 8-character booking reference from the Phase 9
  confirmation plus the customer's email. A valid pair proves the person holds a
  real confirmation and is not enumerable (the reference is derived from the
  cuid).
- **Manage your bookings** — after look-up, the customer sees all their bookings
  (service, date/time, staff, price, reference, status). Upcoming ones can be:
  - **Rescheduled** — an inline availability picker (the same Phase 8 engine) lets
    them choose a new slot for the same service and team member; the booking moves
    and is marked RESCHEDULED.
  - **Cancelled** — with an inline confirm; the booking transitions to CANCELLED.
- **Branded** with the business's saved Form Designer theme, and linked from the
  booking **confirmation screen** ("Manage your booking").

## Architecture / where the logic lives

- **Data layer in `@booking/db`** (`public/manage.ts`):
  - `verifyOwnership(slug, email, reference)` — the single trust boundary: resolves
    the business by slug, the customer by email, and confirms the reference matches
    one of *that customer's* bookings. Returns null otherwise.
  - `lookupCustomerBookings` — the verified customer's bookings, each with
    `canCancel` / `canReschedule` derived from the core state machine.
  - `cancelOwnBooking` / `rescheduleOwnBooking` — **re-verify ownership**, confirm
    the target booking belongs to the customer, then act:
    - cancel goes through the state-machine-guarded `transitionBooking`;
    - reschedule **re-validates the new slot against live availability** (working
      hours, breaks, other bookings, buffers) and then `rescheduleBooking` (which
      re-checks overlap excluding self). Both audit with a null actor.
  - Shared `referenceFor` extracted so the confirmation, the read model and the
    panel all match on the exact code the customer sees.
- **Nothing trusts the client.** No customerId ever crosses the wire; every action
  re-derives it from (email + reference) server-side. Public server actions
  (`lookup/cancel/reschedule`) are unauthenticated but funnel through that check.
- **Frontend never touches the DB** — the panel calls server actions only, and the
  reschedule picker reuses the existing public availability action.

## Database changes

None to the schema — reuses `Booking`, `Customer`, the booking state machine, the
availability engine and the reschedule primitive.

## Tests performed

- **Integration (db)** — `manage.test.ts` (7): look-up succeeds for a valid
  (email, reference) pair (case-insensitive) and returns `canCancel`/`canReschedule`;
  rejects a wrong reference or email (no enumeration); `rescheduleOwnBooking` moves
  the booking to a valid slot and sets RESCHEDULED, rejects an out-of-hours slot
  (conflict) and an unverified request (validation); `cancelOwnBooking` cancels an
  owned booking, after which it is no longer cancellable. DB suite: **55 tests**
  (**123** total).
- **End-to-end (browser + DB)** — on `/book/demo-business/manage`: a wrong
  reference showed the "couldn't find" error (no enumeration); a valid look-up
  listed Mia's bookings; **rescheduling** one moved it to a new availability slot
  and flipped its badge to *Rescheduled* (DB: status RESCHEDULED, new startAt);
  **cancelling** another set it to *Cancelled* (DB: CANCELLED). Both wrote audit
  rows with `actorUserId: null`. Re-seeded to the clean demo state afterward.

## UI review

Screenshots at desktop (light + dark) and mobile (390px): a compact look-up form,
a branded booking list with per-booking status badges, and inline reschedule
(availability grid) / cancel (confirm) flows. Past and completed bookings correctly
show no actions. Responsive with no horizontal overflow on mobile.

## Cost / hosting policy

Fully compliant — no new dependencies, no date library, no external services, no raw
SQL, no schema changes. Portable across Postgres (dev) and MySQL/MariaDB (clients).

## Follow-ups (later phases)

- **Notifications / Email** will let this use a magic-link login and email the
  customer when they cancel or reschedule; the audit rows are the hook points.
- A signed, tokenised "manage" link on the confirmation (and in future emails)
  can pre-fill the reference for one-click access.
