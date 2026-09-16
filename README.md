# Universal Premium Booking Platform

A standalone, reusable, **premium booking engine** that embeds into any website
(HTML, PHP, Laravel, React, Next.js, WordPress, Shopify, Webflow) via a universal
JavaScript widget. Not a SaaS product — you own and configure it for multiple client
businesses with strict per-business data isolation.

> **Source of truth:** [`docs/PHASE-0-ARCHITECTURE.md`](docs/PHASE-0-ARCHITECTURE.md)
> and [`docs/DATABASE-COST-HOSTING-POLICY.md`](docs/DATABASE-COST-HOSTING-POLICY.md).

## Monorepo layout

```
apps/web            Next.js app (admin + customer + employee + /api) — the source of truth
packages/config     Shared tsconfig, ESLint, Tailwind design-system preset
packages/ui         Shared premium UI primitives + design tokens
packages/*          core / db / widget added in their phases (2, 15)
docs/               Architecture, cost policy, and per-phase reports
```

## Prerequisites

- Node.js >= 20 (tested on 22)
- pnpm 10.x
- PostgreSQL (local/free) for dev — **required from Phase 2**, optional in Phase 1

## Getting started

```bash
pnpm install
cp .env.example .env        # adjust values; DATABASE_URL is optional until Phase 2
pnpm dev                    # http://localhost:3000
```

### Scripts (run at the repo root, orchestrated by Turborepo)

| Command | Description |
|---|---|
| `pnpm dev` | Run the web app in development |
| `pnpm build` | Production build of all packages |
| `pnpm start` | Start the built app |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm format` | Prettier write |

## Health check

`GET /api/health` returns service status and which subsystems are configured.

## Build phases

The build follows the 23-phase plan in `docs/PHASE-0-ARCHITECTURE.md` (§L). Each phase:
**Plan → Implement → Test → Typecheck → Lint → Build → UI review → Fix → Report.**
Current status: **Phase 1 — Foundation.**

## Architectural principles

- Backend/API is the source of truth; the frontend/widget never touches the database.
- Domain logic stays framework-free and independent of the UI.
- Every business-owned record carries `businessId`; no cross-business access.
- Branding is configuration-driven, never hard-coded.
- Database-portable (PostgreSQL demo / MySQL-MariaDB client) via a repository abstraction.
- No mandatory paid infrastructure; DB-backed notification queue (no required Redis).
