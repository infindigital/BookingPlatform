# Phase 1 — Foundation (Report)

> Status: **Complete.** Typecheck ✓ · Lint ✓ · Build ✓ · Runtime smoke test ✓.
> No domain features, database schema, or auth yet — those are Phases 2–3.

## What was implemented

- **Monorepo** with pnpm workspaces + Turborepo (`apps/*`, `packages/*`).
- **`apps/web`** — Next.js 15 (App Router) + TypeScript + React 19:
  - Root layout, home/status page (Framer Motion entrance), design-token styling.
  - **Error boundaries:** `error.tsx`, `global-error.tsx`; plus `not-found.tsx` and `loading.tsx` skeleton.
  - **`/api/health`** infrastructure probe (no DB, no domain data).
- **Environment validation** (`src/lib/env.ts`, Zod) run at startup via `instrumentation.ts`; fails fast on bad config. `DATABASE_URL` intentionally optional until Phase 2.
- **Structured logger** (`src/lib/logger.ts`) — JSON lines in prod, readable in dev, `LOG_LEVEL`-aware, dependency-free.
- **`packages/config`** — shared `tsconfig.base.json`, ESLint preset, and the Tailwind **design-system preset** (token-mapped colors, radius, fonts, motion).
- **`packages/ui`** — shared premium primitives: `cn()` util, `Button` (CVA variants), and `styles.css` design tokens (light/dark HSL variables). Consumed as source via `transpilePackages`.
- **Demo config placeholder** (`src/config/demo.ts`) — static, DB-free (real seeds arrive in Phase 2).
- **Tooling:** Prettier (+ Tailwind plugin), root scripts, `.env.example`, `.gitignore`, README.

## Files created

```
package.json, pnpm-workspace.yaml, turbo.json, .npmrc, .gitignore,
.prettierrc.json, .prettierignore, .env.example, README.md
packages/config/{package.json,index.js,tsconfig.base.json,tailwind-preset.js,eslint-preset.js}
packages/ui/{package.json,tsconfig.json,src/lib/cn.ts,src/components/button.tsx,src/styles.css}
apps/web/{package.json,next.config.mjs,tsconfig.json,postcss.config.mjs,tailwind.config.ts,.eslintrc.json}
apps/web/src/lib/{env.ts,logger.ts}
apps/web/src/instrumentation.ts
apps/web/src/config/demo.ts
apps/web/src/app/{globals.css,layout.tsx,page.tsx,error.tsx,global-error.tsx,not-found.tsx,loading.tsx}
apps/web/src/app/api/health/route.ts
```

## Database changes

None. `DATABASE_URL` is defined in `.env.example` and validated (optional) but not consumed yet. Prisma schema/migrations are Phase 2.

## API changes

- Added `GET /api/health` → `{ status, service, phase, timestamp, environment, checks:{ env, database } }`.
- The versioned `/api/v1/*` surface begins in later phases.

## Tests performed

- `pnpm typecheck` → 3/3 packages pass.
- `pnpm lint` → pass (0 warnings/errors on web).
- `pnpm build` → production build succeeds; routes `/`, `/_not-found`, `/api/health`.
- Runtime smoke test (built server): `/api/health` returns `status: ok`; `/` → 200; unknown route → 404 boundary; startup logged structured env validation.
- UI review: home page screenshot (light + mobile) — restrained premium hierarchy confirmed.

## Key decisions & deviations

- **Tailwind v3.4** (not v4) for reliable shared-preset theming across packages with shadcn-style tokens. Upgrade path to v4 remains open.
- **System/self-hostable font stack** via CSS variables instead of `next/font/google`. Build-time Google Fonts fetch is unavailable behind the sandbox proxy and is fragile for client self-host deployments; brand fonts (Inter) can be added later via `next/font/local` with shipped assets — no call-site changes.
- Shared UI consumed **as source** (`transpilePackages`) — no separate build step in dev.

## Remaining issues / notes

- Dark-mode tokens exist but are not yet toggled (no `.dark` class switcher) — the **ThemeProvider is Phase 4**.
- `packages/ui` uses a placeholder lint script (type-checked via `tsc`); a flat ESLint config for packages comes in a later phase.
- No automated unit/E2E tests yet — the testing harness is **Phase 22** (Playwright was used transiently for the UI screenshot only and removed).

## Next phase (Phase 2 — Database/domain)

Prisma schema for all 33 models, migrations, the repository/data-access abstraction
(Postgres/MySQL portable), `businessId` isolation + indexes, seed data, and
transaction-safe booking primitives (double-booking prevention). Requires a running
local PostgreSQL and a real `DATABASE_URL`.
