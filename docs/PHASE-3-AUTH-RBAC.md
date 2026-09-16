# Phase 3 — Auth / RBAC (Report)

> Status: **Complete.** Auth flow verified end-to-end · Tests 27 pass · Typecheck ✓ · Lint ✓ · Build ✓.

## What was implemented

- **Password hashing** (`@booking/db`): bcryptjs `hashPassword`/`verifyPassword`
  (pure-JS, no native build — runs on shared hosting per the cost policy).
- **Auth user lookup** (`findUserForAuth`): resolves a user by email (disambiguated
  by business slug when needed) and aggregates roles + effective permissions.
- **Audit writer** (`writeAudit`): best-effort append to `AuditLog`; wired to log
  `auth.login` on every successful sign-in.
- **NextAuth v5 (Auth.js)** with an **edge-split config**:
  - `server/auth/config.ts` — edge-safe (no DB/bcrypt): JWT session strategy,
    `authorized` route-gate callback, `jwt`/`session` callbacks carrying
    `businessId`, `businessSlug`, `roles`, `permissions`.
  - `server/auth/index.ts` — Node runtime: Credentials provider verifying against
    the DB, `signIn` audit event.
  - `middleware.ts` — protects `/admin` (and future `/employee`) at the edge.
  - `api/auth/[...nextauth]/route.ts` — auth endpoints (Node runtime).
- **RBAC**: pure `hasPermission`/`hasAnyPermission`/`hasAllPermissions` in
  `@booking/core`; server guards `requireSession`/`requirePermission` (redirect on
  failure) for defense-in-depth beyond the middleware.
- **UI**: premium **login page** + form (inline error/loading states), protected
  **/admin** stub (session, roles, effective permissions, an RBAC-gated section),
  sign-out, and `Input`/`Label` primitives added to `@booking/ui`.
- **Seed** updated: admin (`admin@aurora.example`) and employee (`emma@aurora.example`)
  accounts with hashed passwords (`password123`), Emma linked to her Employee record.

## Database changes

No schema change (Phase 2 already modelled User/Role/Permission/UserRole/RolePermission/AuditLog).
Seed now sets `passwordHash` and links an employee user. No migration needed.

## API changes

- `GET/POST /api/auth/[...nextauth]` — Auth.js endpoints (csrf, callback, session, signout).
- Middleware now issues 307 redirects to `/login` for unauthenticated protected routes.

## Tests performed

- **Unit (`@booking/core`)**: RBAC helpers — 7 tests (present/absent/empty, any/all).
- **Integration (`@booking/db`)**: password hash/verify roundtrip; `findUserForAuth`
  aggregates roles/permissions; unknown email → null.
- **Total across workspace: 27 passing** (core 16, db 11).
- **Runtime auth smoke test** (built server) confirmed:
  - unauthenticated `/admin` → **307 → /login?callbackUrl=…**;
  - correct credentials → **302 + session cookie set**; `/admin` → **200** rendering
    name, business, `Administrator` role, all 8 permissions, RBAC-gated approval block;
  - wrong password → **302 → /login?error=CredentialsSignin**.
- `pnpm typecheck` 5/5 · `lint` 5/5 · `build` ✓ (routes: `/`, `/login`, `/admin`, `/api/auth/*`, `/api/health`, middleware).

## Key decisions

- **JWT session strategy** (required by the Credentials provider) — no Session/Account
  tables needed, keeping the schema lean and portable.
- **Edge/Node split** so bcrypt + Prisma stay out of the edge middleware.
- Multi-tenant login resolves the user within their business; ambiguous email across
  businesses requires a business slug (documented).
- `AUTH_SECRET` added to env validation (required in prod; dev fallback for local/CI).
- Explicit type annotations on Auth.js exports to sidestep the known pnpm TS2742
  "inferred type cannot be named" issue.

## Remaining issues / notes

- The premium app shell (sidebar, command palette, notification center, theme toggle)
  is **Phase 4**; `/admin` here is a functional stub.
- `/employee` is gated by middleware but has no page yet (**Phase 12**).
- Password reset, session revocation lists, and rate-limiting on login are deferred to
  **Phase 21 (security hardening)**.
- No OAuth providers yet (Credentials only) — can be added to the provider list later.

## Next phase (Phase 4 — Design system / app shell)

Premium typography scale + tokens, light/dark theme toggle (wiring the `.dark` tokens
already defined), responsive sidebar navigation, Ctrl/Cmd+K command palette, global
search, notification center shell, and the responsive admin layout that Phase 5's
dashboard fills in.
