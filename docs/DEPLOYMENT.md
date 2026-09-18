# Deployment Guide

How to run the Booking Platform in production. Two supported paths:

- **A. Vercel + Neon (Postgres)** — the fastest way to put a live demo in front of a client.
- **B. Node host + Hostinger MySQL/MariaDB** — the client production deployment.

The application is a single Next.js app plus one SQL database. **No Redis, no message
broker, no paid third-party service is required** — email is any SMTP mailbox, and the
notification/webhook queues are drained by a plain scheduled HTTP call.

---

## What the app needs

| Requirement | Notes |
| --- | --- |
| Node.js 20+ | The app is a Next.js 15 server; it needs a Node runtime (not PHP shared hosting). |
| A SQL database | PostgreSQL **or** MySQL/MariaDB. |
| Environment variables | See the table below. |
| (Optional) A scheduler | To drain the notification + webhook queues (any cron / uptime pinger). |
| (Optional) SMTP mailbox | To actually send emails; otherwise queued + logged only. |

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | `postgresql://…` or `mysql://…` connection string. |
| `AUTH_SECRET` | **yes in prod** | Signs admin session JWTs. Generate: `openssl rand -base64 32`. |
| `APP_URL` | recommended | Public URL of the app (absolute links, magic-link emails). |
| `NODE_ENV` | auto | `production` on the host (enables HSTS). |
| `NOTIFICATIONS_CRON_SECRET` | optional | Enables `POST /api/notifications/process`. Unset → endpoint is 404. |
| `WEBHOOKS_CRON_SECRET` | optional | Enables `POST /api/webhooks/process`. Unset → endpoint is 404. |
| `SMTP_HOST`,`SMTP_PORT`,`SMTP_USER`,`SMTP_PASS`,`EMAIL_FROM`,… | optional | SMTP transport. Unset → no-op (queued + logged, nothing sent). |
| `WEBHOOKS_ALLOW_INSECURE` | never in prod | Dev-only escape hatch for http/private webhook targets (SSRF). |

Full annotated list: [`.env.example`](../.env.example).

> **The database credentials stay server-side.** They are never sent to the browser or the
> widget. The widget only ever talks to the public API with a publishable key.

---

## A. Vercel + Neon (demo)

### 1. Create the database on Neon
1. Create a Neon project → copy the **connection string** (the *pooled* one, host contains
   `-pooler`). It looks like:
   `postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`
2. Keep it handy — it becomes `DATABASE_URL`.

### 2. Push the schema + seed the demo
Run these once from your machine, pointing at Neon:

```bash
export DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require"
pnpm install
pnpm --filter @booking/db migrate:deploy   # apply migrations to Neon
pnpm --filter @booking/db seed              # demo business "Aurora Studio" + admin + widget key
```

The seed creates a demo login `admin@aurora.example` / `password123` and a widget key
`pk_demo_booking_123`. **Change both before showing a real client** (see the checklist).

### 3. Import the repo into Vercel
- **New Project → import the Git repo.**
- Vercel detects the Turborepo monorepo. Set:
  - **Root Directory:** `apps/web` (Vercel's monorepo support installs the workspace from the repo root automatically).
  - **Install Command:** `pnpm install` (this runs `prisma generate` via the db package's `postinstall`).
  - **Build Command:** `pnpm --filter web build` (or leave Vercel's default `next build`).
  - **Framework Preset:** Next.js (auto).

### 4. Set environment variables in Vercel
Project → **Settings → Environment Variables** (Production + Preview):
- `DATABASE_URL` = the Neon pooled URL from step 1
- `AUTH_SECRET` = `openssl rand -base64 32`
- `APP_URL` = your Vercel URL, e.g. `https://your-demo.vercel.app`
- (optional) `NOTIFICATIONS_CRON_SECRET`, `WEBHOOKS_CRON_SECRET` = strong random strings

### 5. Deploy
Trigger a deploy. When it's live:
- Admin console: `https://your-demo.vercel.app/admin` (log in with the seeded admin).
- Hosted booking page: `https://your-demo.vercel.app/book/aurora`
- Widget embed demo: `https://your-demo.vercel.app/widget-demo.html`
- Widget script: `https://your-demo.vercel.app/widget.js`

### 6. (Optional) Schedule the queues
The notification + webhook queues are DB-backed and drained by an HTTP call. Add a
**Vercel Cron** (`vercel.json`) or any external pinger:

```jsonc
// vercel.json
{
  "crons": [
    { "path": "/api/notifications/process", "schedule": "*/5 * * * *" },
    { "path": "/api/webhooks/process", "schedule": "*/5 * * * *" }
  ]
}
```
Vercel Cron can't send a secret header, so either leave the secret unset for the demo, or
call the endpoints from an external scheduler that sends `Authorization: Bearer <secret>`.

---

## B. Hostinger MySQL/MariaDB (client production)

> **Important:** Next.js needs a **Node.js runtime**. It cannot run on Hostinger's *shared PHP*
> hosting. Two realistic shapes:
>
> 1. **App on a Node host, database on Hostinger MySQL** — keep the app on Vercel (or a
>    Hostinger **VPS** / any Node host) and point `DATABASE_URL` at the Hostinger MySQL. Simplest.
> 2. **Everything on a Hostinger VPS** — run the Node app and MySQL on the VPS.
>
> Either way, the **client's existing website is untouched** — you embed the widget into it
> (see [`EMBEDDING.md`](./EMBEDDING.md)); only the booking app + DB need a Node host.

### 1. Switch the Prisma provider to MySQL
One-line change in `packages/db/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "mysql"        // was "postgresql"
  url      = env("DATABASE_URL")
}
```

The schema is written to be dialect-neutral (cuid IDs, relations instead of arrays, enums,
`Decimal`, `Json`), and the transaction row-locks that prevent double-booking are
**dialect-aware** (they quote identifiers for whichever database `DATABASE_URL` targets), so
no other code changes are needed.

### 2. Create the schema on MySQL
The committed migrations were generated for PostgreSQL, so for a **fresh MySQL database** use
`db push` (no migration files needed), or generate a MySQL migration baseline:

```bash
export DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DBNAME"
pnpm install                       # runs prisma generate for the mysql client
pnpm --filter @booking/db db:push  # creates all tables on MySQL
pnpm --filter @booking/db seed     # seed the client's business (edit the seed first)
```

(If you prefer versioned migrations on MySQL: delete `packages/db/prisma/migrations`, then
`prisma migrate dev --name init` against the MySQL URL to generate a MySQL baseline.)

### 3. Hostinger MySQL connection details
From hPanel → **Databases → MySQL**: create a database + user, then build the URL:
`mysql://DBUSER:DBPASS@HOSTNAME:3306/DBNAME`
(Hostinger usually allows the app host to connect; if remote access is restricted, run the app
on the same VPS or whitelist the app's IP.)

### 4. Run the app on the Node host
```bash
pnpm install                 # postinstall runs prisma generate
pnpm --filter web build      # next build
pnpm --filter web start      # next start (port 3000) — put PM2 + Nginx/HTTPS in front
```
Point a domain/subdomain (e.g. `https://booking.clientdomain.com`) at it with HTTPS. Set
`APP_URL` to that URL and `AUTH_SECRET` to a fresh secret.

### 5. Email via Hostinger
Use the client's Hostinger mailbox as SMTP (no paid email service needed):
```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=bookings@clientdomain.com
SMTP_PASS=…
EMAIL_FROM=bookings@clientdomain.com
```

---

## Migrations & seeding cheatsheet

| Action | Command |
| --- | --- |
| Apply existing (Postgres) migrations | `pnpm --filter @booking/db migrate:deploy` |
| Create schema on a fresh DB (either dialect) | `pnpm --filter @booking/db db:push` |
| Seed demo/business data | `pnpm --filter @booking/db seed` |
| Inspect data (GUI) | `pnpm --filter @booking/db studio` |

---

## Go-live checklist (before a real client sees it)

- [ ] Set a strong `AUTH_SECRET` (never ship the dev fallback).
- [ ] Change the seeded admin password (`admin@aurora.example` / `password123`).
- [ ] Replace the demo widget key `pk_demo_booking_123` with a per-client key, and set the
      `Website.domain` to lock it to the client's site (see EMBEDDING.md → *CORS / domain locking*).
- [ ] Point `APP_URL` at the real HTTPS URL (HSTS + correct absolute links).
- [ ] Serve over HTTPS (the security headers assume it; HSTS is emitted in production).
- [ ] Configure SMTP so confirmation emails actually send.
- [ ] Schedule the notification + webhook queue endpoints.
- [ ] Seed the client's real business, services, staff and hours (edit `prisma/seed.ts` or use Studio).
