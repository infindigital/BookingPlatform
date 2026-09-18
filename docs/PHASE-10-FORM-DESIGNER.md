# Phase 10 — Form Designer (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · 111 tests ✓ (68 core + 43 db) · UI reviewed (designer + themed public flow, light + dark + mobile) · save → public re-brand verified end-to-end.

## What was implemented

Per-business theming and configuration of the customer booking flow — the
mandatory **config-driven branding** principle — edited in an admin **Form
Designer** with a live WYSIWYG preview and applied to the public
`/book/[slug]` page.

- **Admin Form Designer** at `/admin/form-designer` (gated on `settings.manage`):
  - **Theme** — five named presets (Minimal / Luxury / Modern / Medical /
    Editorial) as starting points, a brand-colour picker (colour input + hex),
    corner-radius and font selectors.
  - **Booking flow** — toggles for the optional team step, the "Any available"
    option, showing prices, and requiring a phone number; a bookable-window
    (days) and minimum-notice (minutes) control; and a custom confirmation
    message.
  - **Live preview** — the real customer `BookingWizard`, rendered inside a
    theme-scoped container, reacting instantly to every edit (colour, corners,
    font, and each flow setting). Preview mode makes "Confirm" a no-op, so
    previewing never writes a booking.
  - Save / Revert with dirty-state detection.
- **Public flow honours the saved config** — `/book/[slug]` applies the business's
  theme as scoped CSS variables and drives the wizard from the saved settings and
  steps (which steps appear, whether prices show, phone requirement, booking
  window, min-lead, confirmation message).

## Architecture / where the logic lives

- **Pure theming maths in `@booking/core`** (`form/`): token/settings/step types
  with safe defaults; `hexToHslTriple`, `luminance`, `readableForeground`,
  `themeCssVars` (turn a brand hex into the design-system's `hsl(var(--token))`
  variables plus a readable foreground); the five presets; and
  `resolveFormTheme` / `resolveFormSettings` / `resolveSteps` that clamp and
  sanitise arbitrary stored JSON. No dependencies, fully unit-tested.
- **Data layer in `@booking/db`** (`form/config.ts`):
  - `getFormConfig(businessId)` — resolved theme/settings/steps + the preset
    catalogue, for the designer.
  - `saveFormDesign(businessId, …)` — writes tokens to a **business-owned
    "custom" theme** created on first save (shared presets stay immutable) and
    repoints the default configuration, which stores settings + steps. Everything
    passes through the core resolvers before persisting, so out-of-range values
    can't be stored.
  - `loadResolvedForm` is reused by the public read model, and the public
    availability + create paths default their **min-lead policy to the saved
    setting server-side**, so a tampered client cannot book inside the lead window.
- **Config-driven branding without a global theme swap** — `themeCssVars` are
  applied as inline custom properties on the page/preview wrapper only, overriding
  the brand colour, ring, radius and font while backgrounds/neutrals keep adapting
  to light/dark.
- **The frontend still never touches the DB** — the designer reads via
  `getFormConfig` (server component) and writes via a `settings.manage`-gated
  server action that audits the change.

## Database changes

None to the schema — the `FormTheme` and `FormConfiguration` models (and the five
seeded presets + default config) already existed. Saving simply adds a
business-owned custom theme the first time.

## Tests performed

- **Unit (core)** — `form/theme.test.ts` (7) and `form/settings.test.ts` (6):
  hex parsing, hex→HSL (matches the design-system indigo exactly), readable
  foreground, token/settings/step resolution and clamping, css-var output. Core
  suite: **68 tests**.
- **Integration (db)** — `form-config.test.ts` (4): `getFormConfig` resolves
  defaults + preset catalogue; `saveFormDesign` creates a custom theme **without
  mutating the preset**, repoints the default config, and persists settings/steps
  (incl. removing the optional employee step); a second save updates the **same**
  custom theme (no duplicate); the saved design surfaces through the public read
  model. DB suite: **43 tests** (**111** total).
- **End-to-end (browser + DB)** — in the designer, applying presets updated the
  live preview instantly (Editorial → red, square, serif; the preview's stepper
  and button re-coloured and de-rounded). Saving the "Modern" preset + a custom
  confirmation message then rebranded the public `/book/demo-business` page —
  its computed `--primary` read `199 89% 48%` (sky-blue #0ea5e9) and the stepper,
  selected-card ring and pill Continue button all followed. Re-seeded to the clean
  demo state afterward.

## UI review

Screenshots at desktop (light + dark) and mobile (390px): a two-column designer
(controls + sticky live preview) that stacks on mobile, consistent with the design
system; preset chips, a native colour picker, toggles rendered as switches, and the
real booking wizard as the preview surface. No horizontal overflow on mobile.

## Cost / hosting policy

Fully compliant — no new dependencies, no date library, no external services, no raw
SQL, no schema changes. Portable across Postgres (dev) and MySQL/MariaDB (clients).

## Follow-ups (later phases)

- **Widget** phase embeds this already-self-contained, themed flow via the universal
  JS snippet.
- **Settings** phase can extend the same pattern (server-resolved, client-edited,
  audited) to business-wide preferences.
- Step **reordering** and custom fields (the `fields` column exists) are natural
  future extensions of the designer.
