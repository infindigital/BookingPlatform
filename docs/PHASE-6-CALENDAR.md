# Phase 6 — Calendar (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 54 tests ✓ · UI reviewed (week / day / agenda / drawer, light + dark + mobile).

## What was implemented

A premium calendar at `/admin/calendar` (replacing the placeholder), reading
real, tenant-scoped booking data through the data layer.

- **Three views** — **Week** (7-day time grid), **Day** (single-column grid), and
  **Agenda** (14-day list grouped by day). A segmented control switches views;
  state lives in the URL (`?view=…&date=…&employee=…`) so views are shareable and
  server-rendered.
- **Time grid** — hour axis, hour gridlines, a **visible window that auto-expands**
  to fit early/late bookings, service-coloured booking blocks, a **live
  "current-time" indicator** on today's column, and **overlap lane-splitting** so
  concurrent bookings sit side-by-side.
- **Navigation** — previous / next (by the view's span), **Today**, and a human
  date-range label.
- **Team-member filter** — dropdown to scope the calendar to one employee or all.
- **Service legend** — colour key for the services in view.
- **Booking detail drawer** — clicking any booking opens a right-side sheet with
  the full read context (when, customer + email, service, team member, location,
  total, notes) and an honest note that editing/rescheduling arrive with the
  booking engine (Phase 7).
- **Timezone-correct** — all day boundaries and grid positions are computed in the
  **business's timezone** via the `Intl`-based helpers (no date library).

## Architecture / where the logic lives

- **Read model in the data layer.** `getCalendarData()`
  (`packages/db/src/calendar/bookings.ts`) runs tenant-scoped queries for bookings
  in an absolute-instant range (plus employees and services for the filter/legend)
  and returns a serialisable DTO that already carries each booking's **layout
  coordinates** (`dayKey`, `startMinutes`, `endMinutes`) computed in the business
  timezone. The client renders a pure grid — it never queries the DB and never does
  timezone math.
- **Pure calendar logic promoted to `@booking/core`.** Civil-date helpers
  (`weekDays`, `addDays`, `rangeDays`, …) and the grid maths (`assignLanes`,
  `hourWindow`) are framework-free and unit-tested there, reused by both the server
  page and the client components.
- **Timezone helpers extended** (`packages/db/src/dashboard/timezone.ts`):
  `localWallClock` (instant → local day + minutes) and `dateMidnightInstant`
  (date key → absolute instant), both unit-tested across UTC and ±offset zones.
- **Client components** (`apps/web/src/components/calendar/*`) handle only
  presentation and interaction (view switch, navigation, filter, selection);
  navigation updates the URL and the server re-fetches.

## Database changes

None. (The Phase 5 seed already includes today's bookings, which the calendar
renders.)

## API changes

None. New client route only: `/admin/calendar` (server-rendered on demand).

## Tests performed

- **Unit (core)** — `calendar/dates.test.ts` (7): add/subtract across month/year
  boundaries, weekday mapping, Monday-based week construction, rolling ranges.
  `calendar/layout.test.ts` (7): lane assignment (non-overlap, 2-way split, lane
  reuse after an interval ends, disjoint clusters) and the hour-window expansion/
  clamping.
- **Unit (db)** — `dashboard-timezone.test.ts` extended (+2): `localWallClock` and
  `dateMidnightInstant` round-trip across UTC / +08:00 / −04:00.
- Full suite: **54 passing** (was 38). `pnpm typecheck` 5/5 · `pnpm lint` 5/5 ·
  `pnpm build` ✓ (`/admin/calendar` dynamic).
- **UI review** (headless Chromium, real login): week + day grids, agenda list,
  the booking drawer, light + dark, and mobile (controls wrap, grid scrolls,
  agenda stacks). A date-label formatting bug (an `Intl` field-combo fallback) was
  found in review and fixed.

## Key decisions

- **URL-driven view state** keeps the calendar server-rendered and shareable, and
  avoids client-side data fetching.
- **Layout coordinates computed server-side** keep all timezone logic in the tested
  data layer and make the client a pure renderer.
- **Read-only in Phase 6.** No drag-to-reschedule or inline edit: rescheduling
  needs the transition + availability rules that are Phase 7/8, so the drawer states
  that plainly rather than shipping a control that doesn't persist.
- **Pure helpers live in `@booking/core`** (testable, framework-free) rather than in
  `apps/web`, which has no test runner.

## Remaining issues / notes

- Rescheduling / creating from the calendar arrives with the booking engine
  (Phase 7); the drawer is the entry point for it.
- Bookings that cross local midnight are clamped to their start day for layout
  (rare; the agenda still lists them). Multi-day handling can be revisited if needed.
- The grid renders a business-hours-centric window (auto-expanded to fit bookings);
  a user-configurable start/end hour can come with Settings (Phase 19).

## Next phase (Phase 7 — Booking engine)

The full booking lifecycle: create/edit bookings, the complete status state machine
(with the transition rules the dashboard/calendar already respect), reschedule with
double-booking re-validation, and the Bookings management screen.
