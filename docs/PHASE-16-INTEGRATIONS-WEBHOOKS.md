# Phase 16 — Integrations: Outbound Webhooks (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 212 tests ✓ (118 core + 94 db) · UI reviewed (endpoints + secret reveal + deliveries, light + dark + mobile) · the full booking-event → queue → **signed HTTP delivery** → log pipeline verified against an in-process receiver, including a live end-to-end delivery through the running app whose HMAC signature was independently verified.

## What was implemented

A real **outbound webhook** system so a business can react to booking events in
its own tools (Zapier, Make, n8n, or a custom endpoint). Every subscribed event
becomes a **signed HTTP POST** delivered through a durable, retrying, DB-backed
queue — **no broker, no external service, no new dependency** (delivery uses the
built-in `fetch`), honouring the cost policy.

- **Endpoints.** An admin registers one or more https endpoints at
  **`/admin/integrations`**, each subscribed to a chosen set of events
  (`booking.created` / `confirmed` / `rejected` / `cancelled` / `rescheduled` /
  `completed`). Each endpoint has a **signing secret**, shown once on create /
  rotate, with copy-and-verify instructions. Endpoints can be edited, toggled
  active/off, secret-rotated, tested, and deleted.
- **Signed deliveries.** Every request carries `X-Booking-Event`,
  `X-Booking-Delivery` and `X-Booking-Signature: t=<ts>,v1=<hmac>` — an
  **HMAC-SHA256** over `${timestamp}.${body}`. A receiver recomputes the HMAC with
  its copy of the secret to verify authenticity + integrity and rejects an old
  timestamp to stop replays. `verifySignature` is exported for the platform's own
  receivers and tests.
- **Durable, retrying queue.** A booking event fans out to one `WebhookDelivery`
  per matching active endpoint (the exact request snapshot is stored, so a retry
  re-sends identical bytes). A dispatcher claims each due delivery with an
  **optimistic guard** (no lock server), POSTs it, and on a non-2xx **retries with
  exponential backoff** (immediate, 1m, 5m, 30m, 2h) up to 5 attempts, then FAILED.
  A **"Send test event"** ping and a per-failure **Retry** are available in the UI.
- **Send-out is best-effort.** Webhook problems never break the booking mutation
  that triggered them — the emit path is fully caught + logged, exactly like the
  notification enqueue.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `integrations/webhooks.ts`)** — pure and tested: the
  event catalogue, the internal→public event mapping, the delivery **backoff** and
  **due-ness** rules, the **signature contract** (the exact string to sign + header
  names), and **URL / SSRF validation** (`validateWebhookUrl`, `isPrivateHostname`).
- **Data layer (`@booking/db`, `integrations/`)**:
  - `signing.ts` — `generateWebhookSecret`, `computeSignature` / `signatureHeaderValue`
    (HMAC-SHA256), and constant-time `verifySignature` (with timestamp tolerance).
  - `webhook.repository.ts` — tenant-scoped CRUD (`WebhookRepository`, added to
    `repositoriesFor`), events always sanitized to the allow-list.
  - `payload.ts` — the stable public JSON booking payload.
  - `emit.ts` — `emitBookingWebhook` fans an internal event out to subscribed
    active endpoints (best-effort).
  - `deliver.ts` — the one place that performs an outbound request: built-in
    `fetch`, hard timeout, `redirect: 'manual'`, and a **send-time SSRF re-check**
    (`deliveryPolicy` blocks http/private hosts in production).
  - `dispatch.ts` — `processWebhookDeliveries` (claim → sign → deliver → retry/fail),
    plus `sendWebhookPing` and `retryWebhookDelivery`.
  - `read.ts` — `getWebhookList` (with delivery counts + last status, **never the
    secret**) and `getWebhookDeliveries`.
- **App layer** — server actions gated on **`settings.manage`** and audited
  (`webhook.create/update/toggle/rotate_secret/delete/ping/retry/process`); a
  **cron endpoint** `POST /api/webhooks/process` guarded by `WEBHOOKS_CRON_SECRET`
  (disabled → 404) so an external scheduler drains the queue with no hosted worker;
  the `/admin/integrations` UI. The frontend never touches the DB or performs the
  outbound request.

## Database changes

**None.** The `Webhook` and `WebhookDelivery` models (and the
`WebhookDeliveryStatus` enum) already existed in the schema; this phase implements
the engine and UI on top of them. Retry scheduling needs no extra column — a
PENDING delivery is "due" when `updatedAt + backoff(attempts)` has passed, and
staying PENDING naturally reschedules the next attempt.

## Tests performed

- **Domain (core)** — `webhooks.test.ts` (13): the event catalogue + mapping, key
  sanitization, monotonic-and-capped backoff, due-ness, the signature payload +
  header format, SSRF host classification, and URL validation (https required,
  private hosts rejected unless allowed). Core suite: **118 tests**.
- **Integration (db)** — `webhooks.test.ts` (9): against an **in-process HTTP
  server** — emit creates a PENDING delivery per active subscribed endpoint (and
  skips unsubscribed / inactive ones and notification-only events); a due delivery
  is sent with a **signature the receiver verifies** (and a tampered body fails);
  a failing endpoint **retries with backoff then FAILS at exactly 5 attempts** (no
  extra requests); a **ping** delivers immediately; a **manual retry** re-arms a
  FAILED delivery to SUCCESS; the **SSRF guard rejects a private host under the
  production policy**; the signing roundtrip verifies fresh and rejects a stale
  timestamp; the list model exposes counts but **never the secret**. DB suite:
  **94 tests** (**212** total).
- **End-to-end (running app)** — signed in as the admin: added an endpoint pointing
  at a local receiver, saw the one-time secret, clicked **Test**; the receiver got
  a real signed POST, and its `X-Booking-Signature` was **independently verified**
  (HMAC-SHA256 with the revealed secret) — the Deliveries tab then showed the ping
  **Delivered (HTTP 200)**. Demo state cleaned afterwards.

## UI review

Screenshots at desktop (light + dark) and mobile (390px, no horizontal overflow):
the empty state, the **Add endpoint** drawer (URL + event checkboxes + active
toggle), the **one-time signing-secret banner** (copy + HMAC verification note),
an endpoint card (URL, event chips, delivery counts, last-status badge, and the
Test / edit / toggle / rotate / delete controls), and the **Deliveries** table with
status badges, HTTP codes, attempts and per-failure Retry.

## Cost / hosting policy

Fully compliant — **DB-backed delivery queue, no broker/Redis**, outbound requests
via the built-in `fetch` (**no new dependency**), no date library, and a **cron
endpoint** so any external scheduler drains the queue with no hosted worker.
Secrets stay server-side. Portable across Postgres (dev) and MySQL/MariaDB
(clients).

## Security notes

- **SSRF.** Endpoint URLs are validated on save and re-checked at send time;
  http:// and private/loopback/link-local hosts are blocked in production (a
  dev/test-only `WEBHOOKS_ALLOW_INSECURE` escape hatch exists), and redirects are
  not followed. This is a strong guard, not DNS-rebinding-proof; an allow-list of
  destinations can be layered on later if a deployment needs it.
- **Authenticity.** HMAC-SHA256 signatures with a per-endpoint rotatable secret;
  the secret is shown only once and never returned by a list read.

## Follow-ups (later phases)

- **SMS / WhatsApp channel providers** for notifications — deferred intentionally:
  they need real provider credentials + a live account to be genuine (no fake
  implementations), and they slot into the existing notification `ChannelProvider`
  seam when that account exists.
- **Per-endpoint event replay / bulk redrive** and a downloadable delivery log.
- **Inbound API keys** for the public booking API (Widget/API phase), reusing this
  same signing + audit foundation.
