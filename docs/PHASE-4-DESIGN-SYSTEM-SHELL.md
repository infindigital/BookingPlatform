# Phase 4 — Design System / App Shell (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · UI reviewed (light/dark/mobile/⌘K).

## What was implemented

- **UI primitives** in `@booking/ui` (Radix-based, shadcn-style, theme-token driven):
  `skeleton`, `separator`, `dropdown-menu`, `sheet`, `tooltip`, and `command` (cmdk),
  alongside the existing `button`/`input`/`label`.
- **Theme system**: `next-themes` provider (`attribute="class"`) wired to the `.dark`
  design tokens from Phase 1; a **mode toggle** (Light / Dark / System) in the top bar.
  Root `Providers` also mounts the tooltip provider.
- **Responsive app shell** for `/admin`:
  - Fixed **sidebar** on desktop with grouped navigation (Workspace / Catalog /
    Operations / Configure) covering all 14 admin sections from the spec, active-state
    highlighting, and brand mark.
  - **Mobile drawer** (Sheet) with the same nav, opened from a hamburger button.
  - Sticky **top bar**: global search trigger, notification center, theme toggle,
    account menu.
- **Command palette (⌘K / Ctrl+K)**: centered dialog (cmdk) with fuzzy search over
  navigation + a theme-toggle action; also serves as the top-bar **global search**.
- **Notification center** shell: bell dropdown with an honest empty state (the live
  feed lands in Phase 13).
- **Account menu**: avatar initials, name/email, sign-out (moved out of the Phase 3
  header into the polished top bar).
- **Graceful placeholder** catch-all (`/admin/[...slug]`) so every nav link resolves to
  a clean "arrives in Phase N" state; concrete pages added later automatically take
  precedence.

## Database changes

None.

## API changes

None. New client routes only: `/admin/[...slug]` placeholder; the shell wraps all
`/admin/*` pages.

## Tests performed

- `pnpm typecheck` 5/5 · `pnpm lint` 5/5 · `pnpm build` ✓ (routes: `/`, `/login`,
  `/admin`, `/admin/[...slug]`, `/api/*`, middleware).
- Existing unit/integration suites unaffected (27 tests still pass from Phases 2–3).
- **UI review** via headless Chromium after real login:
  - desktop **light** and **dark** shells (dark tokens verified live);
  - **⌘K command palette** opens and lists navigation;
  - **mobile drawer** opens and navigates;
  - placeholder page renders for unbuilt sections.

## Key decisions

- **shadcn-style primitives in `@booking/ui`** (consumed as source via
  `transpilePackages`) keep the design system shared and themable from one token set.
- **`next-themes` class strategy** matches the `darkMode: ['class']` Tailwind config and
  the pre-defined `.dark` tokens — no token rework needed.
- **Catch-all placeholder** instead of 13 stub files: honest, DRY, and auto-superseded
  by real pages, avoiding dead nav links without fake content.
- Notification/search kept to **functional shells** (no fabricated data) per the "no
  fake implementations" rule; each is labeled with the phase that fills it in.

## Remaining issues / notes

- The Overview page is still the Phase 3 session/RBAC stub — the **premium dashboard
  (KPIs, activity, Today timeline, pending approvals)** is **Phase 5**.
- Notification feed → **Phase 13**; entity search in the palette → wired as Bookings/
  Customers/Services pages land (Phases 5–11).
- `@booking/ui` still uses a placeholder lint script (type-checked via `tsc`); a flat
  ESLint config for packages remains a later cleanup.

## Next phase (Phase 5 — Dashboard)

Replace the Overview stub with the premium command center: KPI cards (today's bookings,
pending approvals, confirmed, revenue, utilization), activity stream, a "Today" timeline,
pending-approval queue with contextual actions, and quick-create — reading real data
through the Phase 2 repositories.
