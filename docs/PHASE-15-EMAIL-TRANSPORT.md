# Phase 15 — Email transport (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 190 tests ✓ (105 core + 85 db) · UI reviewed (email delivery card + send-test + magic-link manage, light + dark + mobile) · the full booking-event → queue → **SMTP** → branded HTML → log pipeline verified end-to-end against an in-process mock SMTP server, and the branded email rendered and screenshotted.

## What was implemented

A real **email delivery transport** for the notification engine built in Phase 14,
plus a **magic-link "manage booking"** experience — all with **no new runtime
dependency and no mandatory paid service** (cost policy).

- **A dependency-free SMTP client.** Sending mail is a well-defined text protocol,
  so instead of adding a mailer library the platform speaks SMTP directly over
  Node's own `net`/`tls`: greeting → EHLO → optional **STARTTLS** upgrade (or
  **implicit TLS** on 465) → **AUTH LOGIN / AUTH PLAIN** → MAIL/RCPT/DATA with a
  MIME **multipart/alternative** body, correct CRLF framing, dot-stuffing, RFC 2047
  subject encoding, and header-injection guards. Any SMTP mailbox works — the
  client's Hostinger email, Google Workspace, a self-hosted Postfix — so there is
  no lock-in and nothing to pay for.
- **A concrete `SmtpEmailProvider`** that plugs into the Phase 14 `ChannelProvider`
  seam. It is registered for the EMAIL channel **at server startup** when SMTP env
  vars are present; otherwise the default **no-op** stays in place so dev/demo runs
  need zero mail setup.
- **Branded HTML emails.** The dispatcher now wraps each rendered template body in a
  responsive, self-contained HTML shell (inline styles, no external asset, no
  tracker) with the business wordmark, the message, a **"Manage booking"** button,
  and a plain-text alternative. Rendering lives in `@booking/core` (pure, tested);
  unknown template tokens still render empty, and every value is HTML-escaped so a
  template value can never inject markup.
- **Magic-link manage booking.** Booking emails carry a link to the public manage
  page with the customer's email + booking reference pre-filled
  (`/book/{slug}/manage?ref=…&email=…`); the page **auto-verifies** and shows the
  customer's bookings with reschedule/cancel. A new `{{booking.manageUrl}}` template
  variable exposes the same link to custom templates. This is a convenience link,
  not a bearer secret — every action still re-verifies the (email, reference) pair
  server-side, exactly as the Phase 12 self-service flow already did.
- **Admin "Email delivery" card** on `/admin/notifications`: shows whether SMTP is
  connected (host/port/TLS mode, from address, auth) or the no-op is in use, with
  the exact env vars to set, and a **Send test email** button. Secrets are never
  exposed — the status is a non-secret projection that omits the password.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `notifications/email-layout.ts`)** — pure and tested:
  `escapeHtml`, `textToHtml` (paragraphs + safe linkify), `renderBrandedEmail`
  (branded HTML shell with the optional CTA button; validates the accent hex and
  the URL scheme), `renderEmailText` (plain-text alternative with the link). Added
  `booking.manageUrl` to the template variable allow-list.
- **Data layer (`@booking/db`, `notifications/`)**:
  - `smtp-client.ts` — the dependency-free SMTP client (`sendSmtpMail`,
    `buildMimeMessage`). Ordered, awaitable replies over a re-bindable stream
    (plain → TLS after STARTTLS); per-step timeouts.
  - `smtp-provider.ts` — `SmtpEmailProvider implements ChannelProvider`, plus
    `emailConfigFromEnv` / `emailProviderFromEnv` / `emailConfigStatus` (the last is
    a non-secret projection for the UI).
  - `register.ts` — `registerProvidersFromEnv()` wires the EMAIL provider from env
    (or logs that the no-op is in use).
  - `dispatch.ts` — for the EMAIL channel, builds the branded HTML + text-with-link
    from the booking context and passes both to the provider. Non-email channels
    are unchanged.
  - `variables.ts` — resolves the magic-link manage URL (from `APP_URL` + slug +
    reference + email) and the business name for branding; adds `booking.manageUrl`.
  - `test-email.ts` — `sendTestEmail(to, businessName)` sends a branded sample
    through whichever provider is registered.
- **App layer** — SMTP env vars (all optional) validated in `lib/env.ts`; the
  provider registered once in `instrumentation.ts` at boot; the **Email delivery**
  card + **Send test email** server action (gated on `settings.manage`, audited
  `notification.email.test`); the manage page reads the magic-link query and
  auto-verifies. The frontend never touches SMTP or the DB directly.

## Database changes

**None.** No schema change, no migration — this phase only adds a transport behind
the existing channel seam and reuses the existing `NotificationJob` / `NotificationLog`
tables and the Phase 12 public manage flow.

## Tests performed

- **Domain (core)** — `email-layout.test.ts` (12): escaping, paragraph/`<br>`
  conversion, safe linkify, markup-injection resistance, the CTA button appearing
  only for a valid https URL (and `javascript:` rejected), accent-hex validation,
  the hidden preheader, and the plain-text link append. Core suite: **105 tests**.
- **Integration (db)** — `smtp-client.test.ts` (12): against an **in-process mock
  SMTP server** — authenticates (AUTH LOGIN) and delivers a multipart message with
  the right From/To/Subject/Message-ID; sends a text-only message with no auth;
  fails fast on a bad host; `SmtpEmailProvider` maps success to a `SendResult` and
  fails cleanly with no recipient; `buildMimeMessage` encodes a non-ASCII subject
  (RFC 2047) and strips CRLF from headers (injection guard); `emailConfigFromEnv`
  returns null when unconfigured, picks implicit TLS for 465 / STARTTLS for 587,
  and the status never exposes the password. DB suite: **85 tests** (**190** total).
- **End-to-end (real DB + SMTP)** — registered the provider from env pointing at a
  mock SMTP server, created a booking, ran `handleBookingEvent(BOOKING_ACCEPTED)`
  and `processDueNotifications`: dispatch **sent 1**, the mock captured a
  **multipart/alternative** message with the correct `From: "Aurora Spa" <…>`, an
  RFC 2047 subject decoding to *"Your booking is confirmed — Aurora Spa"*, a branded
  HTML part containing the business name, the **Manage booking** button and the
  magic link `https://…/book/…/manage?ref=…`, and a **SENT `NotificationLog`** with
  the provider message id.

## UI review

Screenshots at desktop (light + dark) and mobile (390px, no horizontal overflow):
the **Email delivery** card in its honest *Not configured* state with the env-var
guidance and pre-filled admin address; the **Send test email** result (the no-op
transport reports "accepted but nothing sent" in an amber note); the **magic-link
manage page** auto-verifying straight to the customer's booking list without any
manual entry; and the **rendered branded confirmation email** itself (card, wordmark
+ accent rule, spaced body, prominent CTA, fallback link, footer).

## Cost / hosting policy

Fully compliant — **no new runtime dependency** (SMTP spoken directly over Node's
`net`/`tls`), **no mandatory paid email service** (any SMTP mailbox works), no date
library (dates via `Intl`), **credentials stay server-side** (env only, never in the
DB, never returned to the client), and the self-contained HTML uses **no external
asset or tracker**. Portable across Postgres (dev) and MySQL/MariaDB (clients).

## Follow-ups (later phases)

- **SMS / WhatsApp providers** with the Integrations phase — the same
  `ChannelProvider` seam and the schema's channel enum already support them.
- **Per-business email identity + branding** (from-name, reply-to, accent colour,
  logo) surfaced in the Settings phase, overriding the env defaults per tenant.
- **DKIM/return-path niceties** and provider-API transports (SES/Resend/etc.) as
  optional alternatives to SMTP for high-volume senders — additive, behind the same
  seam.
