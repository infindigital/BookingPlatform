# Phase 20 — Analytics (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 288 tests ✓ (166 core + 122 db) · UI reviewed (summary + time series + status mix + breakdowns, light + dark + mobile, no horizontal overflow at 390px) · verified against the database, with a live review through the running app (metric toggle + range presets re-query and re-render correctly).

## What was implemented

A real **analytics dashboard** at **`/admin/analytics`** (gated on the existing
`analytics.read` permission) over a **selectable date range** — every number is
aggregated on the backend from real bookings and the Phase-18 payment ledger,
tenant-scoped, with nothing fabricated.

- **Range control.** Presets (7 / 30 / 90 days, 12 months) plus a custom
  from/to picker. The default is the last 30 days in the business timezone.
- **Summary.** Bookings (+ unique customers), booked revenue (confirmed +
  completed), collected revenue (net of the ledger), completion rate
  (completed ÷ (completed + no-show)), and new customers first seen in range.
- **Over time.** A hand-built area/line chart of a chosen metric — **Bookings**,
  **Booked** revenue, or **Collected** revenue — auto-bucketed by **day / week /
  month** depending on the span so it stays readable from a week to a year.
- **Status mix.** A proportional stacked bar + legend across all booking states.
- **Breakdowns.** Top services, top staff, and booking sources (widget / admin /
  API), each a bar list with count and revenue.

Buckets are computed on each booking's **local day** in the business timezone,
so a series lines up with how the business actually experiences time.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `analytics/`)** — pure and tested: `daySpan`,
  `chooseGranularity` (day ≤ 31d, week ≤ 182d, else month), `bucketKeyOf`
  (day / Monday-of-week / first-of-month), `enumerateBuckets`, `bucketLabel`,
  and `ratio` / `formatPercent`. Also added `BOOKING_STATUS_LABELS` to the
  canonical status module (reused by the UI).
- **Data layer (`@booking/db`, `analytics/`)** — `getAnalytics(businessId,
  {fromDayKey, toDayKey, timeZone})`: one tenant-scoped read of the range's
  bookings + payment transactions + new-customer count, aggregated in memory
  into the summary, the bucketed series (booked **and** collected revenue),
  the status counts, and the service / staff / source breakdowns. The range is
  normalised and capped at 366 days.
- **App layer** — an `analytics.read`-gated server action (`loadAnalytics`); the
  `/admin/analytics` page (computes the default range + business timezone) and
  the `AnalyticsWorkspace` client view with a **dependency-free inline-SVG
  chart kit** (`TimeSeriesChart`, `BarList`, `StatusBar`) that themes via
  `currentColor` + design tokens.

## Database changes

**None.** Analytics is a pure read model over existing bookings and the payment
ledger; no schema change and no migration.

## Tests performed

- **Domain (core)** — `analytics/analytics.test.ts` (10): day span, granularity
  selection, bucket-key mapping (incl. Monday-based weeks and a Sunday edge
  case), inclusive bucket enumeration across a year boundary, labels, and the
  ratio/percent helpers. Core suite: **166 tests**.
- **Integration (db)** — `analytics.test.ts` (5) against the real database with a
  fixed six-booking fixture across three days plus a two-entry payment ledger:
  the summary (bookings, completed/no-show/cancelled, completion rate, booked
  vs. collected revenue, unique + new customers); the daily series (including a
  negative collected point from a refund); the status / service / staff / source
  breakdowns; a long range collapsing to **monthly** buckets; and **tenant
  isolation** (another business sees zero). DB suite: **122 tests** (**288**
  total).
- **End-to-end (running app)** — signed in as the admin: the default 30-day view
  renders the real demo data; toggling the series metric (Bookings → Booked →
  Collected) and switching the range preset to 12 months both re-query and
  re-render, with the range collapsing to monthly buckets as expected.

## UI review

Screenshots at desktop (light + dark) and mobile (390px, no horizontal overflow):
the summary cards, the over-time chart with its metric toggle (bookings count and
currency axes), the status-mix stacked bar, and the three breakdown panels.
First/last axis labels are anchored so they never clip.

## Cost / hosting policy

Fully compliant — **no charting dependency** (the charts are hand-built inline
SVG), `Intl` for currency/date formatting (no date library), all aggregation
server-side, and everything portable across Postgres (dev) and MySQL/MariaDB
(clients).

## Security notes

- **Server-side + tenant-scoped.** Every aggregate is computed in the data layer
  under a single `businessId`; the client never queries the database.
- **RBAC.** The page and its action require `analytics.read`.
- **Bounded work.** The range is capped at 366 days to keep a single request's
  aggregation predictable.

## Follow-ups (later phases)

- **CSV export** of the current range (bookings / revenue).
- **Comparison to the previous period** (deltas on the summary cards).
- **Per-location / per-employee filters** on the whole dashboard.
- **Events** analytics once the events domain lands.
