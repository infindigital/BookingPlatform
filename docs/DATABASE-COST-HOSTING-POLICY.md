# Database Cost & Hosting Policy (Confirmed)

> Part of the project specification (Product Bible v2, final section).
> These are **binding constraints** on every phase.

The booking system must start with a free/low-cost development database and avoid
unnecessary recurring infrastructure costs.

## 1. Development / Demo Database

- Use a free/local PostgreSQL option for the demo/build stage.
- Do **not** require a paid managed database to begin development.
- The application must work locally with PostgreSQL.

Preferred path: **Local PostgreSQL -> free hosted PostgreSQL (demo/staging) ->
production database supplied by the client's hosting environment.**

## 2. Client Production Database

- Prefer the **MySQL/MariaDB already included with the client's Hostinger plan** when
  technically appropriate.
- Do not introduce a separate paid database service unless there is a specific technical
  requirement **and the owner explicitly approves it**.

Production path: **Client Hostinger hosting -> MySQL/MariaDB -> Booking backend/API ->
Client website widget.**

## 3. No Database Subscription Requirement

- The product must **not** depend on a mandatory paid database subscription.
- Database portability is a core architectural requirement.
- Prisma + the repository/data-access abstraction keep the domain layer portable between
  the supported PostgreSQL and MySQL/MariaDB configurations.

## 4. Infrastructure Approval Rule

Do **not** add Supabase, Neon, Railway, PlanetScale, managed PostgreSQL, hosted Redis, or
any other paid infrastructure as a **mandatory** dependency. If a hosted service is
suggested, first explain the free/local alternative and **wait for owner approval** before
making it a required architecture component.

## 5. Cost-Control Rules

- Database credentials must remain server-side.
- The frontend/widget never connects directly to the database.
- Keep the notification queue **DB-backed** so it can run on shared hosting with
  cron/worker support.
- Do **not** make Redis a mandatory dependency for the MVP.
- Do **not** make SaaS billing or client subscriptions part of the architecture.
- Validate MySQL/MariaDB compatibility **early**, not after development.

## 6. Definition of Done (architectural)

The project is architecturally complete only when the **same booking domain** can be
demonstrated against the free/demo PostgreSQL setup **and** configured for a client's
MySQL/MariaDB production environment **without rewriting the core booking logic**.
