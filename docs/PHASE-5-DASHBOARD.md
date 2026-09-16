# Phase 5 — Dashboard (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 38 tests ✓ · UI reviewed (light / dark / mobile) · approve action verified end-to-end.

## What was implemented

The Overview stub is replaced with a **premium command center** that reads real,
tenant-scoped data through the Phase 2 data layer.

- **KPI row (5 tiles)** — Today's bookings, Pending approvals, Upcoming confirmed,
  Revenue (this month), and Utilization. Every value is derived from live data;
  none are fabricated. Utilization is a transparent heuristic (booked minutes today
  ÷ open-hours × active employees) and is labelled "closed today" when there is no
  scheduled capacity — the availability engine (Phase 8) refines the denominator.
- **Today's schedule** — a timeline of today's bookings (business-timezone aware)
  with service colour, customer, employee, duration and status, plus an honest
  empty state.
- **Pending approvals queue** — real, permission-gated **Approve / Reject** actions.
  For a viewer without `booking.approve` it degrades to a read-only "awaiting
  decision" view.
- **Recent activity** — the latest bookings with initials avatars, status and a
  relative timestamp.
- Prominent **New booking** action (honest navigation to the Bookings area — the
  create flow is Phase 7; no fake form).

## Architecture / where the logic lives

- **All aggregation is server-side and tenant-scoped.** `getDashboardMetrics()`
  (`packages/db/src/dashboard/metrics.ts`) runs every query with an explicit
  `businessId`, in parallel, and returns a typed read-model DTO. The UI never
  issues its own queries — it renders the DTO.
- **Timezone boundaries** (`packages/db/src/dashboard/timezone.ts`) are computed
  with the built-in `Intl` API — no date library added (cost/dependency policy).
  Pure and unit-tested (UTC, +08:00, −05:00, month/year rollover, weekday, HH:MM).
- **Guarded status transition** (`packages/db/src/booking/transition.ts`,
  `setBookingStatus`) is real, minimal domain logic: load-and-verify tenant →
  guard the current status against `allowedFrom` → update, all in one transaction.
  Approve/reject only act on a `PENDING` booking, so a decision can't be flipped or
  double-applied. The **full** booking state machine and notification-enqueue are
  Phase 7/12–13; this function is forward-compatible (callers pass allowed source
  states; the notification hook has a marked slot).
- **Server actions** (`apps/web/src/server/bookings/actions.ts`) enforce
  `requirePermission('booking.approve')`, resolve `businessId` from the session,
  call the domain transition, **audit** the change (`writeAudit`), and
  `revalidatePath('/admin')`. Domain errors (already-decided / gone) are treated
  as benign and just refresh the view; unexpected errors propagate.

## New reusable UI primitives (`@booking/ui`)

- `card` (Card/Header/Title/Description/Content/Footer) and `badge` (semantic
  tones) — token-driven, themed by the existing design system.

## Database changes

None to the schema. The **demo seed** now also creates three bookings *today*
(non-overlapping per employee) so the dashboard demonstrates with live data.
Idempotent as before.

## Tests performed

- **Unit** — `dashboard-timezone.test.ts` (7): day/month ranges across UTC and
  ±offset zones, year rollover, weekday mapping, `HH:MM` parsing.
- **Integration** — `booking-transition.test.ts` (4): approve `PENDING→ACCEPTED`;
  refuse a status not in `allowedFrom`; **tenant isolation** (another business's
  booking is not found / untouched); `getDashboardMetrics` scoping (no cross-tenant
  leakage, correct pending/today/revenue figures).
- Full suite: **38 passing** (was 27). `pnpm typecheck` 5/5 · `pnpm lint` 5/5 ·
  `pnpm build` ✓ (`/admin` is now server-rendered on demand, as expected).
- **UI review** (headless Chromium, real login): desktop light + dark, mobile
  (KPIs reflow to 2-up, drawer nav, panels stack). **Approve action verified
  end-to-end** — a real button click transitioned the booking in the database
  (`PENDING→ACCEPTED`), wrote a `booking.approve` audit row with
  `{from, to}` metadata, and the queue/KPIs/revenue/timeline all reconciled
  (Pending → "You're all caught up").

## Key decisions

- **Read-model in the data layer, not the component** keeps domain/data logic
  independent of the UI and centralises tenant scoping.
- **Real (not faked) approve/reject.** A pending queue with dead buttons would
  violate the "no fake implementations" rule, so the transition is genuinely wired,
  guarded, permission-gated and audited — while deliberately scoped so it does not
  pre-empt the Phase 7 state machine.
- **No date library.** `Intl`-based timezone math honours the dependency policy.
- **Utilization is honest.** A labelled heuristic today, not a fabricated number;
  the availability engine improves it later.

## Remaining issues / notes

- "New booking" and pending-queue rows point at `/admin/bookings` (still the
  Phase 4 placeholder) until the booking management pages land (Phase 6/7).
- Notification-on-transition is intentionally deferred to Phase 12/13 (hook marked
  in `transition.ts`).
- Utilization denominator uses business hours × active employees; time-off,
  holidays and per-employee schedules fold in with the availability engine (Phase 8).

## Next phase (Phase 6 — Calendar)

A premium calendar/agenda over the same tenant-scoped data: day/week/resource
views, drag-to-reschedule scaffolding, and navigation from the dashboard timeline
into a booking's context.
