# Phase 14 — Notifications (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 166 tests ✓ (93 core + 73 db) · UI reviewed (templates + editor + activity, light + dark + mobile) · the full enqueue → queue → dispatch → send → log pipeline verified against the DB, including through the admin "Process queue" button.

## What was implemented

A complete, **DB-backed notification system** — no Redis, no external broker, no
mandatory paid service (cost policy) — that turns every booking event into a
customer message delivered through a durable, retrying queue, plus an admin
**Notifications** area at **`/admin/notifications`** to author templates and watch
delivery.

- **Templates** — editable per event (Booking received / confirmed / declined /
  cancelled / rescheduled / completed, plus Reminder and Follow-up). Each has a
  subject and body with `{{ variable }}` placeholders, an insert-a-variable helper,
  an **Active** toggle, a **live preview** rendered with sample data, and
  **Reset to default**. Until an admin edits one, the built-in default copy is used
  (shown as not "Customised").
- **Activity** — recent queue jobs with event, recipient, scheduled time, status
  (Queued / Processing / Sent / Failed / Cancelled) and retry count, a status
  roll-up, a **Refresh**, and a **Process queue** button that drains what's due on
  demand.
- **Events wired in** — public booking creation, admin approve/reject/cancel/
  complete, admin + public reschedule, and admin booking creation all enqueue the
  right message; confirming a booking also **schedules a reminder** before the
  appointment, and cancelling/declining/completing **cancels** a pending reminder.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `notifications/`)** — pure and tested: the default
  template catalogue, the allow-listed `renderTemplate` (`{{token}}` → value, never
  `eval`, unknown tokens render empty so a raw placeholder never reaches a
  customer), the variable list, retry **backoff** (`retryDelayMs` / `nextRetryAt` /
  `shouldRetry`) and **reminder scheduling** (`reminderScheduledAt`).
- **Data layer (`@booking/db`, `notifications/`)**:
  - **Queue model** — `NotificationJob` (status, `scheduledAt`, `attempts` /
    `maxAttempts`, `lastError`, `idempotencyKey`) is the queue; a due job is
    `QUEUED AND scheduledAt <= now` (indexed `[status, scheduledAt]`).
  - **Enqueue** (`handleBookingEvent`) — best-effort (never breaks the booking
    mutation): resolves active channels from templates (defaults to EMAIL), creates
    jobs, and applies the reminder policy. Reminders are idempotent per
    booking+channel and re-armed on reschedule.
  - **Dispatcher** (`processDueNotifications`) — claims each due job with an
    **optimistic `QUEUED → PROCESSING` guard** (so concurrent workers can't
    double-send — no lock server needed), renders the template with booking
    variables (dates via `Intl`, no date library), sends through a **pluggable
    channel provider**, writes a `NotificationLog`, and on failure retries with
    exponential backoff until `maxAttempts`, then `FAILED`.
  - **Provider seam** — `ChannelProvider` with a default **no-op** transport that
    accepts and returns a synthetic id; a real EMAIL/SMS/WhatsApp integration drops
    in during the Email/Integrations phase without touching the dispatcher.
  - **Config + activity read models** — `getNotificationTemplates` (stored rows
    merged with defaults), `saveNotificationTemplate` / `resetNotificationTemplate`,
    and `getNotificationActivity`.
- **App layer** — server actions gated on **`settings.manage`** and audited
  (`notification.template.save/reset`, `notification.process`); a **cron endpoint**
  `POST /api/notifications/process` guarded by a shared secret
  (`NOTIFICATIONS_CRON_SECRET`; disabled → 404 when unset) so an external scheduler
  can drain the queue with no hosted worker. The frontend never touches the DB.

## Database changes

None to the schema — the `NotificationTemplate`, `NotificationJob` and
`NotificationLog` models and their enums already existed. The seed now leaves
templates at their defaults and cleans notification rows on reseed.

## Tests performed

- **Domain (core)** — `notifications.test.ts` (11): rendering (substitution,
  spaces, missing/unknown tokens empty, no injection via values), token listing, a
  default for every event, monotonic-and-capped backoff, `shouldRetry`, and reminder
  offset. Core suite: **93 tests**.
- **Integration (db)** — `notifications.test.ts` (9): enqueue creates a QUEUED job
  (and skips a deactivated template); a reminder is scheduled ahead of the start and
  **cancelled on cancellation**, and never scheduled in the past; the dispatcher
  **sends a due job → SENT + a SENT log with the recipient and provider id**, leaves
  a future job untouched, and **retries a failing job with backoff then FAILS at
  maxAttempts** (with a FAILED log per attempt); the template and activity read
  models merge defaults and return context + counts. DB suite: **73 tests**
  (**166** total).
- **End-to-end (browser + DB)** — signed in as the admin: the Templates list, the
  editor with live preview (variables resolved to sample data), and the Activity
  view. Firing three real booking events enqueued 4 jobs (event messages + a future
  reminder); clicking **Process queue** dispatched the 3 due jobs → **3 SENT with 3
  SENT logs**, left the future reminder QUEUED, and wrote a `notification.process`
  audit row `{ sent: 3, claimed: 3 }`. Re-seeded to a clean state afterward.

## UI review

Screenshots at desktop (light + dark) and mobile (390px): the event template cards,
the editor drawer (Active toggle, subject/body, variable chips, live preview,
save/reset) and the activity table with status badges and the process control. A
mobile check confirmed the editor has no horizontal overflow.

## Cost / hosting policy

Fully compliant — **DB-backed queue, no Redis**, no external broker, no date
library (dates via `Intl`), no new runtime dependencies. The only transport is the
in-process no-op provider; a real email provider arrives in a later phase. Portable
across Postgres (dev) and MySQL/MariaDB (clients).

## Follow-ups (later phases)

- **Email transport** — a real EMAIL `ChannelProvider` (SMTP / provider API) plus a
  magic-link "manage booking" link; SMS/WhatsApp providers with the Integrations
  phase (the schema and channel seam already support them).
- **Configurable reminder lead time** and follow-up scheduling per business (default
  is 24h), alongside the Settings phase.
- **In-app admin bell** — surface a staff activity feed in the topbar (currently an
  honest empty state); distinct from these outbound customer messages.
