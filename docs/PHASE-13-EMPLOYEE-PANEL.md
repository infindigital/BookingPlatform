# Phase 13 — Employee Panel (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 146 tests ✓ (82 core + 64 db) · UI reviewed (list + detail, light + dark + mobile) · a service assignment made **through the UI** was verified in the database and against the availability engine.

## What was implemented

A full **Employees** admin area at **`/admin/employees`** for managing the team —
who they are, what they offer, and when they work — where every edit genuinely
drives what customers can book.

- **Employees list** — a searchable, tenant-scoped table with the facts a manager
  scans for: avatar + name, job title, a **Login** badge when the member has an
  account, services offered, **weekly hours** (window time minus breaks), upcoming
  bookings, and active status. A "Show inactive" toggle reveals archived staff.
- **New / edit team member** — a right-hand drawer for the profile (first/last
  name, title, email, phone) with an **Active** switch; inactive members are
  hidden from availability and can't be booked.
- **Employee detail drawer** with three live editors, each saving on its own:
  - **Services** — the whole service catalogue with an assign checkbox and an
    optional **per-employee price override** (defaults to the base price).
  - **Working hours** — a weekly editor: per weekday a working window
    (start → end) with any number of **breaks** (add/remove). This is exactly what
    the Phase 8 availability engine reads.
  - **Time off** — list upcoming/booked time off and add or remove entries; the
    availability engine subtracts approved time off from bookable slots.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `employee/schedule.ts`)** — pure, UI-free rules that
  both the data layer and the UI share: `parseHhMm`, `validateWorkingWindow`
  (start < end, breaks in-range and non-overlapping), `validateWeeklySchedule`
  (names the offending day), and `weeklyWorkingMinutes` for the list aggregate.
  Fully unit-tested.
- **Data layer (`@booking/db`)**:
  - `EmployeeRepository` (wired into `repositoriesFor`, so **every** query is
    businessId-scoped). Composite writes are transactional: `setServices` rewrites
    assignments atomically and **silently drops any service id from another
    tenant**; `replaceWeeklyHours` rewrites the whole week (breaks cascade) so
    availability always matches the saved state; `addTimeOff` / `removeTimeOff`.
  - Read models `getEmployeesList` (aggregates via `groupBy`, no N+1) and
    `getEmployeeDetail` (profile, the full catalogue with assignment flags, the
    weekly schedule with breaks, time off, and booking stats).
- **Server actions (`apps/web/src/server/employees/actions.ts`)** — all gated on
  the `employee.manage` permission, all **audited** (`employee.create`,
  `employee.update`, `employee.services.set`, `employee.hours.set`,
  `employee.timeoff.add/remove`). Hours are re-validated server-side through the
  core rules before writing; price overrides are bounds-checked.
- **Frontend never touches the DB** — the workspace and drawers call server
  actions only; the page reads through the db read models.
- The concrete `app/admin/employees/page.tsx` automatically **overrides the
  catch-all placeholder** for that route.

## Database changes

None to the schema — reuses `Employee`, `EmployeeService`,
`EmployeeWorkingHours`, `Break`, `TimeOff` and the availability engine.

## Tests performed

- **Domain (core)** — `schedule.test.ts` (14): time parsing/formatting, window +
  break validation (out-of-range, inverted, overlapping), weekly minutes, and the
  day-named weekly validation. Core suite: **82 tests**.
- **Integration (db)** — `employees.test.ts` (9), proving the editors feed
  availability: an unassigned employee has no availability; **assigning a service +
  hours produces bookable slots** (all offered by that employee); unassigning
  removes them; a **cross-tenant service id is ignored**; a **break carves out the
  overlapping slots** (11:00 stays, 12:00 gone, 13:00 resumes); **approved time off
  removes slots** and removing it restores them; `getEmployeeDetail` round-trips
  assignments/overrides/breaks; `getEmployeesList` aggregates services, weekly
  minutes (420 = 8h − 1h lunch) and upcoming bookings; **inactive employees drop
  out of availability**. DB suite: **64 tests** (**146** total).
- **End-to-end (browser + DB)** — signed in as the admin: the list rendered both
  seeded staff with correct services / **35h/wk** / upcoming / status; the detail
  drawer showed Emma's two services and full weekly hours with lunch breaks.
  Assigning **Signature Consultation** to Noah **through the UI** and saving was
  confirmed in the database (`employeeService` row created) with an audit row
  (`employee.services.set`, actor = the admin user, `count: 2`). Re-seeded to the
  clean demo state afterward.

## UI review

Screenshots at desktop (light + dark) and mobile (390px): a clean list table, and
the detail drawer with the services checklist (+ price overrides), the weekly hours
editor (per-day toggle, start/end, add/remove breaks) and the time-off panel. A
mobile break-row overflow was found and fixed (reduced indent + wrapping); re-checked
with zero horizontal overflow.

## Cost / hosting policy

Fully compliant — no new dependencies, no date library (times via the built-in
schedule helpers + `Intl`), no external services, no raw SQL, no schema changes.
Portable across Postgres (dev) and MySQL/MariaDB (clients).

## Follow-ups (later phases)

- **Multiple working windows per day** (e.g. a split shift) — the data layer and
  engine already support many rows per weekday; the editor currently exposes one
  window per day plus breaks. A "+ shift" control can surface the rest.
- **Location-aware hours** — `EmployeeWorkingHours.locationId` is stored; the
  multi-location UI arrives with the Locations phase.
- **Self-service staff view** — an employee-role member seeing only their own
  schedule and bookings, once notifications/roles UI land.
- Time-off entries are captured in the admin's local timezone; a business-timezone
  picker can be added alongside the Settings phase.
