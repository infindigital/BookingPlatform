# Phase 9 — Customer-Facing Booking UI (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 89 tests ✓ (50 core + 39 db) · UI reviewed (5-step flow, light + dark + mobile) · public booking verified end-to-end against the DB.

## What was implemented

A public, unauthenticated, premium booking flow at **`/book/[slug]`** — the
customer-facing counterpart to the admin tools — driven by the Phase 8
availability engine and creating a **PENDING** booking through the same
transaction-safe primitive the admin uses.

- **Public booking page** (`/book/[slug]`) — resolves the business by its public
  `slug`, 404s for an unknown one, and renders a 5-step wizard. It is outside the
  auth middleware, so no login is required.
- **Multi-step wizard** (Service → Team → Time → Details → Review → Confirmation):
  - **Service** — active services grouped by category, with duration, price and
    colour.
  - **Team** — "Any available" (default) plus the specific staff who actually offer
    the chosen service.
  - **Time** — a 14-day availability strip that only shows days with real openings
    (weekends/closed days drop out automatically), and a slot grid for the selected
    day. Slots come straight from the availability engine, so lunch breaks, existing
    bookings, buffers, time-off and a 60-minute minimum lead are all respected.
  - **Details** — name, email, phone, notes with inline validation.
  - **Review** — a full summary and total before confirming.
  - **Confirmation** — a reference code, the assigned team member, the formatted
    date/time, and a clear "pending confirmation" message.
- **Live conflict handling** — if the chosen slot is taken between selection and
  submission, the server returns a conflict, the wizard clears the slot and drops the
  visitor back to the Time step to pick again.

## Architecture / where the logic lives

- **The frontend never touches the database.** Three server-side entry points do all
  the work, and only ever return a deliberately narrow public shape:
  - **`getPublicBookingData(slug)`** (`@booking/db`) — business + active services +
    categories + active employees (with the service ids they offer). No customers, no
    other bookings, no internal notes, no credentials.
  - **`fetchPublicAvailability`** (server action → `getPublicAvailability(slug, …)`) —
    slug-scoped wrapper over the Phase 8 engine; returns slot instants the client
    formats in the business timezone.
  - **`submitPublicBooking`** (server action → `createPublicBooking(…)`).
- **Nothing trusts the client.** `createPublicBooking` re-resolves the business by
  slug, re-checks the service is active, and **re-validates the requested time against
  the live availability engine** before writing. For "Any available" it assigns one of
  the employees the engine reports free for that exact slot. The final insert goes
  through `createBooking`'s per-employee `FOR UPDATE` lock, so two visitors racing for
  one slot cannot both win.
- **Public bookings are PENDING**, `source: 'public'` — they land in the admin
  approval queue built in Phase 7. The action writes an audit row with a null actor
  (a customer, not a staff user).
- **Timezone-correct.** Wall-clock times are converted with the existing `Intl`-based
  helpers (no date library — cost policy); day pills and slot labels render in the
  business timezone.

## Database changes

None to the schema. The **seed** already carries the lunch break from Phase 8, which
makes the customer time-grid gaps visible in the demo.

## Tests performed

- **Integration (db)** — `public-booking.test.ts` (6): `getPublicBookingData` returns
  the catalogue and hides inactive services / unknown slugs; `createPublicBooking`
  creates a PENDING, `source:'public'` booking at the correct instant with an
  auto-assigned employee and an upserted (lowercased-email) customer; rejects a time
  outside working hours; rejects an already-taken slot (double-book prevention);
  rejects an invalid email before touching the schedule. Suite: **39 db tests**
  (**89** total with core).
- **End-to-end (browser + DB)** — walked the whole wizard on `/book/demo-business` and
  confirmed a real booking. The DB row was **PENDING**, `source:'public'`, at
  **15:30Z** for the "3:30 PM" slot (60-min service → 16:30Z end), employee
  auto-assigned (Emma), customer upserted, audit row with `actorUserId: null`. A
  subsequent run correctly showed Emma's afternoon fully consumed by that new booking —
  the grid reflects new bookings live. The time grid also correctly skipped the
  weekend and showed the lunch gap and buffer-driven exclusions.

## UI review

Screenshots at desktop (light + dark) and mobile (390px) across all five steps plus the
confirmation. Consistent with the design system: a slim progress stepper (labels hide
on mobile), selectable cards with the primary ring, a horizontally-scrollable day
picker, a responsive slot grid, and a clean confirmation card. Continue is gated per
step (e.g. no slot → disabled). No horizontal overflow on mobile.

## Cost / hosting policy

Fully compliant — no new dependencies, no date library, no external services, no raw
SQL. Portable across Postgres (dev) and MySQL/MariaDB (client deployments).

## Follow-ups (later phases)

- **Form Designer** phase will let each business theme this flow (the `FormTheme` /
  `FormConfiguration` models are already in the schema) and choose/reorder steps.
- **Widget** phase will embed this flow via the universal JS snippet (the page is
  already self-contained and `robots: noindex`).
- **Notifications / Email** phases will send the customer a confirmation and notify
  staff of the pending request (the audit + PENDING status are the hook points).
