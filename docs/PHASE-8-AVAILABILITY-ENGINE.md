# Phase 8 — Availability Engine (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 83 tests ✓ (50 core + 33 db) · UI reviewed (slot picker, light + dark + mobile) · availability-driven create + auto-assignment verified end-to-end.

## What was implemented

A real availability engine — pure slot math in `@booking/core`, resolved against
live data in `@booking/db` — and its first consumer: an availability-driven slot
picker in the admin **New booking** form (no more free-typed times).

- **Pure slot generation** (`@booking/core`) — interval algebra (`mergeSpans`,
  `subtractSpans`, `subtractManySpans`, `overlapsAny`, all half-open) plus
  `generateSlots`, which walks each open window at a step granularity and yields the
  valid start times for a service: the slot must fit the window, its buffer-padded
  span must clear everything busy, and it must respect `now + minLead`. Results are
  sorted and de-duplicated across overlapping windows. Unit-agnostic and fully tested.
- **Data-layer resolver** (`@booking/db` → `getAvailability`) — turns real records
  into the spans the core engine needs, per eligible employee, per day:
  - **Windows** = each employee's `EmployeeWorkingHours` for that weekday, **minus**
    their `Break`s (two-window split around lunch, etc.).
  - **Busy** = existing bookings (slot-occupying statuses) + approved `TimeOff` +
    employee-specific and **global** `BlockedTime`.
  - **Excluded days** = `Holiday`s (exact date and recurring month-day), in the
    business timezone.
  - Only **active** employees who actually **offer the service** (via
    `EmployeeService`) are considered; an optional `employeeId` narrows to one.
  - Each returned slot carries the **set of employees free to take it**, so an "any
    available" request can be auto-assigned safely.
- **Slot picker in the create form** — service / team member / date are now
  controlled inputs; changing any of them re-queries `loadAvailableSlots` and renders
  a grid of real open times (loading / empty / selectable states). The free time
  field is gone — submit is disabled until a slot is chosen, so an admin can only book
  a genuinely bookable time.
- **"Any available" auto-assignment** — when no specific team member is chosen, the
  selected slot's free-employee set is sent with the form and the server assigns one
  of them, preserving the per-employee double-booking guarantee (an unassigned booking
  would have bypassed it).

## Architecture / where the logic lives

- **Purity boundary held.** All the scheduling math (windows, buffers, breaks,
  lead time, de-dup) is pure and lives in `@booking/core` with no DB or timezone
  knowledge. `@booking/db` does only resolution: query tenant-scoped records, convert
  wall-clock working hours to instants (`wallTimeToInstant`), and hand spans to the
  core engine. The frontend never computes availability — it calls a server action.
- **Timezone-correct.** Working-hours strings (`"09:00"`) become real instants for
  the target day via the existing `Intl`-based helpers (no date library — cost
  policy). Holiday matching is done in the business timezone.
- **Tenant isolation.** Every query in `getAvailability` is filtered by `businessId`;
  the service, employees, working hours, bookings, time-off, blocks and holidays are
  all scoped.
- **Server action** (`loadAvailableSlots`) — `booking.read`-gated, resolves the
  business timezone, calls `getAvailability` for the requested day, and formats each
  start into a 24h value (`time`, feeds the form) plus a friendly label — both via
  `Intl` with the business timezone.

## Database changes

None to the schema. The engine reads existing models (`EmployeeWorkingHours`,
`Break`, `EmployeeService`, `Booking`, `TimeOff`, `BlockedTime`, `Holiday`). The
**seed** was enriched with a daily **12:00–13:00 lunch break** per employee so the
gap is visible in the demo (slots now split morning/afternoon around it).

## Tests performed

- **Unit (core)** — `intervals.test.ts` and `slots.test.ts` (13): merge/subtract
  algebra; window-fitting; busy collisions; before/after buffers as required gaps;
  the two-window split around a break; `now + minLead` filtering; de-dup across
  overlapping windows. Core suite: **50 tests**.
- **Integration (db)** — `availability.test.ts` (4): hourly slots correctly skip a
  booked hour and a lunch break (`09:00, 11:00, 13:00–16:00`); each slot carries the
  eligible employee; a service the employee doesn't offer yields nothing; approved
  time-off removes the covered afternoon. DB suite: **33 tests**. Grand total: **83**.
- **End-to-end (browser + DB)** — logged into `/admin/bookings`, opened **New
  booking**: the picker rendered real times with a visible **11:30 AM → 1:00 PM**
  lunch gap. Created a booking at 3:00 PM with "Any available"; the DB row landed at
  `15:00Z` (correct wall-time → instant) with an **auto-assigned** employee and an
  audit row. A second 3:00 PM booking auto-assigned the **other** employee — proving
  the engine dropped the now-busy one from that slot. Re-seeded to the clean demo
  state afterward.

## UI review

Screenshots captured at desktop (light + dark) and mobile (390px). The slot grid is
a clean 3-column layout consistent with the design system; selected state uses the
primary token; the drawer scrolls and the footer's **Create booking** stays disabled
until a slot is picked. No horizontal overflow on mobile.

## Cost / hosting policy

Fully compliant — no new dependencies, no date library (all math via built-in `Intl`
and integer millis), no external services. Works identically on Postgres (dev) and
MySQL/MariaDB (client deployments); no raw SQL was added.

## Follow-ups (later phases)

- The same `getAvailability` will feed the **customer-facing booking UI** (Phase 9+).
- `stepMinutes` / `minLeadMinutes` are engine parameters ready to be wired to
  per-business booking settings when the Settings phase lands.
