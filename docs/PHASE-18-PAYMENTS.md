# Phase 18 — Payments (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 244 tests ✓ (138 core + 106 db) · UI reviewed (payments list + record/refund drawer + settings, light + dark + mobile) · the full policy → payment-record → ledger → derived-status pipeline verified against the database, including a live end-to-end recording through the running app (Collected/Outstanding/Refunded totals moved correctly).

## What was implemented

A real, **provider-agnostic payment system**: a business sets a payment policy
(none / deposit / full price), every booking that owes money gets a `Payment`
record computed on the backend, and staff record collected payments and refunds
against an immutable ledger. **No payment gateway is mandatory** — the shipped
provider is **manual / offline** (cash, card-in-person, bank transfer), honouring
the cost policy while remaining a complete, genuine payment system. A real
gateway can be registered later behind the same seam without touching the engine.

- **Payment policy.** At **`/admin/payments` → Settings**, a business chooses
  **No payment**, **Deposit** (a percentage of the price or a fixed amount), or
  **Full payment**; picks which offline methods staff may record; and writes
  customer-facing payment instructions. All values are clamped in pure domain
  code (a percent to 0–100, a fixed deposit never above the price).
- **Amount owed is a backend fact.** When a booking is created (public *or*
  admin), the amount due is computed **on the server** from the service price and
  the policy — the client never supplies a price or an amount. Nothing is owed
  (NONE, or a free service) → no payment row is created. The public confirmation
  now shows the **Deposit due / Amount due**.
- **A ledger, not a guessed number.** Every charge or refund is appended to a
  `PaymentTransaction` row; `amountPaid` (net) and the **derived status**
  (`UNPAID` / `PARTIALLY_PAID` / `PAID` / `REFUNDED`) are **recomputed from the
  ledger inside the same DB transaction**, so the stored rollup can never drift
  from the money that actually moved. A refund can never exceed the net
  collected.
- **Operations view.** The Payments tab shows **Collected / Outstanding /
  Refunded** totals, status facets with counts, search, and a table of every
  payment (customer, service, reference, status, required / paid / balance,
  booked date) with **Record** and **Refund** actions (a drawer captures amount,
  method, reference, and a note; the amount pre-fills with the outstanding
  balance / refundable net).

## Architecture / where the logic lives

- **Domain (`@booking/core`, `payments/`)** — pure and tested: money rounding +
  `Intl` currency formatting (no money/date library), the policy resolver
  (`resolvePaymentSettings`, clamps + method allow-list), `computeAmountDue`
  (none / deposit-percent / deposit-fixed / full), and the ledger math —
  `sumLedger`, `derivePaymentStatus`, `remainingBalance`. The `PaymentStatus`
  union is the canonical one from `booking/status` (mirrored by the Prisma enum).
- **Data layer (`@booking/db`, `payments/`)**:
  - `provider.ts` — the `PaymentProvider` seam + registry, with the default
    `ManualPaymentProvider` (the only one shipped).
  - `settings.ts` — `loadPaymentSettings` / `savePaymentSettings` (upsert,
    resolved through the core resolver).
  - `payment.repository.ts` — tenant-scoped `PaymentRepository` (added to
    `repositoriesFor`): `ensureForBooking` (idempotent), `recordCharge` /
    `recordRefund` → append to the ledger then recompute rollup + status **in one
    transaction**.
  - `create.ts` — `ensurePaymentForBooking`, the booking-time entry point.
  - `read.ts` — `getPaymentsList` (rows + status facets + money summary; **never
    exposes anything a list shouldn't**).
- **App layer** — server actions gated on a new **`payment.manage`** permission
  and audited (`payment.settings.update` / `payment.charge` / `payment.refund`);
  the `/admin/payments` workspace. Payment creation is wired into both booking
  paths **best-effort** (a payment problem never fails a booking the customer
  already completed — exactly like the notification/webhook emit paths).

## Database changes

One migration (`payments_settings_ledger`):

- New enums `PaymentMode` (NONE/DEPOSIT/FULL), `DepositType` (PERCENT/FIXED),
  `PaymentTxnType` (CHARGE/REFUND).
- New model **`PaymentSettings`** (one row per business — the policy).
- New model **`PaymentTransaction`** (the immutable charge/refund ledger).
- `Payment` gains a `transactions` relation and a `(businessId, status)` index;
  its `amount` / `amountPaid` are now documented as *required* vs *net collected*.
- Seed: added the **`payment.manage`** permission (granted to Administrator).

The `Payment` model itself already existed since Phase 2; this phase implements
the engine, ledger, policy and UI on top of it.

## Tests performed

- **Domain (core)** — `payments.test.ts` (20): money rounding/clamp/format,
  settings resolution + clamping + method sanitisation, amount-due across all
  four policy shapes (incl. cent rounding and the fixed-deposit cap), and status
  derivation across unpaid → partial → paid → refunded → partial-after-refund,
  plus ledger sums and remaining balance. Core suite: **138 tests**.
- **Integration (db)** — `payments.test.ts` (12) against the real database:
  settings save/reload with clamping; `ensurePaymentForBooking` creates nothing
  under NONE, a full-price UNPAID payment under FULL, a deposit-sized payment
  under DEPOSIT, and is idempotent; the ledger drives PARTIALLY_PAID → PAID; a
  refund larger than the net collected is **rejected**; a full refund →
  REFUNDED; a zero amount is rejected; **tenant isolation** (another business
  cannot touch the payment); and `getPaymentsList` reports rows, status facets
  and the Collected/Outstanding/Refunded summary. DB suite: **106 tests**
  (**244** total).
- **End-to-end (running app)** — signed in as the admin: set a 30% deposit
  policy in Settings, saw payments generated for demo bookings, recorded a
  payment through the drawer, and watched **Collected rise / Outstanding fall**
  with the row moving to **Paid** — verified across unpaid, partly-paid, paid and
  refunded rows. Demo state cleaned afterwards.

## UI review

Screenshots at desktop (light + dark) and mobile (390px, no horizontal
overflow): the payments table with status badges and money columns, the
summary cards, the **Record payment** drawer (required/paid/balance figures,
amount pre-filled with the balance, method select, reference + note), and the
**Settings** tab (policy cards, deposit type + value, method chips, instructions).

## Cost / hosting policy

Fully compliant — **no mandatory payment gateway** (the manual/offline provider
is the default and is a complete system), no new dependency, `Intl` for money
formatting (no money/date library), amounts computed server-side, and everything
portable across Postgres (dev) and MySQL/MariaDB (clients).

## Security notes

- **Amounts are server-authoritative.** The price and the amount due are read
  from the service + policy on the backend; the client cannot influence them.
- **Refund safety.** A refund is capped at the net collected, enforced inside the
  transaction that writes it.
- **RBAC.** All payment reads/writes require `payment.manage`; every mutation is
  audited.

## Follow-ups (later phases)

- **A real online gateway** registered behind the `PaymentProvider` seam
  (hosted-checkout redirect + a signed webhook that records the charge through
  the same ledger) — optional, never mandatory.
- **Per-service deposit overrides** (a service that always takes full payment
  under an otherwise deposit policy).
- **Customer-facing "pay your balance"** link on the self-service manage panel,
  reusing the magic-link foundation from Phase 15.
- **Payment receipts** as a notification event, reusing the Phase 14/15 engine.
