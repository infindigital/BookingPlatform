# Phase 22 — Universal Embeddable Widget + Public API (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 327 tests ✓ (190 core + 137 db) · UI reviewed end-to-end (full booking flow, popup modal, light/dark host, mobile 390px with no horizontal overflow) · public API exercised live (config / availability / booking incl. a real PENDING booking and a 409 on a taken slot).

This is the product's defining capability: a **standalone booking widget that embeds into any
website** (HTML, PHP, Laravel, React/Next, WordPress, Shopify, Webflow…) with a single
`<script>` tag, talking only to a **public JSON API** scoped by a publishable key. The frontend
never touches a database; the backend re-resolves the tenant and re-validates every request.

## What was implemented

### 1. Public JSON API — `/api/v1/public/*`
Unauthenticated but **key-scoped**: a third-party page sends its publishable
`Website.publicKey` (header `X-Public-Key` or `?key=`), which resolves to exactly one business.
CORS is derived from the website's configured `domain`; a domain-less website is a fully public
"paste anywhere" key. Every endpoint is a thin HTTP layer over the **already-existing, already-tested**
public booking domain — no booking logic was reinvented.

- `GET /config` — business identity + bookable catalogue (categories / services / team) + the
  Form Designer theme, settings and steps that drive branding and flow.
- `GET /availability?serviceId=&employeeId=&from=&to=` — free slots from the live availability
  engine (working hours − breaks − time-off − holidays − blocks − existing bookings, with
  buffers / capacity / min-lead), never revealing *why* a slot is absent.
- `POST /bookings` — creates a customer booking. Re-resolves the business, re-checks the service,
  re-validates the slot, then writes through the transaction-safe `createBooking` primitive
  (per-employee `FOR UPDATE` lock). Public bookings are **PENDING** (await admin approval).
- `OPTIONS` preflight on each route; a consistent JSON error envelope
  (`{ error: { message, code } }`); best-effort **rate limiting**.

### 2. The universal widget — `/widget.js`
A single **dependency-free, hand-authored** script (no bundler, no framework, no build step —
per the cost/hosting policy) that renders the whole booking flow inside a **Shadow DOM**, so host
CSS can neither leak in nor out. It holds no secrets: the publishable key only identifies a
business, and the server authorizes everything.

- **Config-driven branding.** On load it fetches `/config` and applies the business's
  `primary` colour, corner `radius` and `font` as CSS custom properties — no hardcoded brand.
- **Full flow**, mirroring the hosted `/book/[slug]` wizard: **service → team → date & time →
  details → review → confirmation**, with a step meter, back navigation, inline validation and a
  reference-number confirmation screen.
- **Two modes** from data-attributes: **inline** (`<div data-booking-key>`) and **popup**
  (`data-booking-mode="popup"` launcher button → modal overlay with ESC / backdrop close).
- **Programmatic API**: `BookingWidget.render(el, opts)`, `BookingWidget.open(opts)`,
  `BookingWidget.init()`; auto-initialises every `[data-booking-key]` on load.
- Times formatted in the business timezone via `Intl` (no date library); money via `Intl`.
- A live-updating flow: a slot taken mid-booking (409) bounces the visitor back to pick another.

### 3. Demo host page — `/widget-demo.html`
A fictional third-party site that embeds the widget both inline and as a popup — the fixture used
for UI review and a copy-paste reference for integrators.

## Architecture / where the logic lives

- **Domain (`@booking/core`, `public/`)** — pure and tested: `originAllowed` / `resolveAllowedOrigin`
  (CORS host matching, apex ⇄ www, scheme-agnostic) and a dependency-free `RateLimiter`
  (fixed-window token bucket, injectable clock, bounded memory). No Redis, no broker.
- **Data layer (`@booking/db`, `public/website.ts`)** — `resolveWebsiteByPublicKey` turns an
  untrusted key into a tenant identity (business id + slug + name + domain), returning `null` for
  an unknown or disabled key so the API can't be used to probe key existence. The API endpoints
  reuse the existing `getPublicBookingData` / `getPublicAvailability` / `createPublicBooking`.
- **App layer** — `src/lib/public-api.ts` centralises key resolution, CORS headers, the error
  envelope and rate limiting behind `guardPublicRequest`; each route is a few lines over it.
- **Widget** — `apps/web/public/widget.js`, served statically at `/widget.js`.

## Database changes

None to the schema — the `Website` model (with its unique `publicKey`, optional `domain` and
`isActive` flag) already existed. The **seed** was updated so the demo website's key is
domain-less (a fully public embed key), matching the "drop it on any site" onboarding story;
domain-locking remains an opt-in a business configures per website.

## Tests performed

- **Domain (core)** — `public/public.test.ts` (16): origin-host parsing, domain normalisation,
  `originAllowed` (open key, no-Origin, scheme-agnostic, apex ⇄ www, foreign-host rejection),
  `resolveAllowedOrigin`, and the rate limiter (limit, window reset, per-key independence, memory
  eviction). Core suite: **190 tests**.
- **Integration (db)** — `public-website.test.ts` (5): active key resolves to the tenant; disabled
  key → null; unknown key → null; empty/whitespace → null; padded key is trimmed. DB suite:
  **137 tests** (**327** total).
- **End-to-end (live API + widget)** — against the running app: `/config` returns the demo
  catalogue and theme; bad key → 403, missing key → 401, preflight → 204; `/availability` returns
  real slots; `POST /bookings` creates a real PENDING booking (201) and a second attempt on the
  same slot returns 409; missing service → 400. Through the widget in a browser: completed the
  whole flow (service → team → time → details → review → confirm) and received a booking reference;
  popup modal opens/closes; zero console errors. All demo bookings cleaned afterwards.

## UI review

Screenshots at desktop (light + dark host) and mobile (390px, no horizontal overflow): the service,
team, date-&-time (scrollable day strip + slot grid), details, review and confirmation steps; the
popup launcher button (brand-coloured) and the modal overlay. The widget keeps its own
brand-controlled surface regardless of host dark mode — a deliberate choice (like Stripe/Calendly
embeds) so the business's branding, not the visitor's OS, decides its look.

## Cost / hosting policy

Fully compliant — **no new dependency**, no bundler/build step for the widget (hand-authored
vanilla JS), `Intl` for all date/money formatting, rate limiting is an in-process token bucket
(no Redis), and everything runs on plain shared hosting. CORS and key auth are enforced
server-side; the DB is never exposed.

## Security notes

- **Publishable key ≠ secret.** The key only names a business; it grants read of the public
  catalogue/availability and the ability to *request* a PENDING booking. All authorization,
  validation and tenant scoping happen server-side.
- **Tenant isolation** on every request via `resolveWebsiteByPublicKey`; the reused domain
  functions are all `businessId`-scoped.
- **CORS** is per-website: a business can lock its key to its own domain (apex + www), or leave it
  open for a public embed.
- **Overbooking is impossible** — public bookings go through the same `FOR UPDATE`-locked
  `createBooking` path as the admin flow (409 on a taken slot).
- **Abuse guard** — best-effort per-key/IP rate limiting on reads and (tighter) writes.

## Scope note / follow-ups (later phases)

- **Widget self-service manage** (cancel/reschedule) — the `manage.ts` domain already exists; a
  public `manage` endpoint + a widget "manage booking" entry point is the natural extension.
- **Public event registration** through the widget, reusing the Phase-21 capacity engine.
- **Origin allow-list** (multiple domains per website) and a signed embed token for higher-trust
  deployments.
- **Widget size/versioning** — a minified `widget.min.js` build and a cache-busting version query
  when a build step is later introduced.
