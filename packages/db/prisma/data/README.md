# Midwest Identity Services data load

An **idempotent** production loader that provisions the real Midwest Identity
Services tenant from a JSON file. It upserts the business, public website,
primary location, weekly hours, service categories and services, the permission
catalogue, the Administrator and Employee system roles, a real admin user, and
(optionally) staff. It **never** creates customers or bookings, and re-running
it updates in place instead of duplicating.

## Files

- `midwest.template.json` - committed placeholder showing the exact shape.
  Every real value is a `REPLACE_ME` / `0` / example string. Category names
  (Fingerprinting, Notary, Apostille) reflect the real service lines.
- `midwest.json` - your real data. **Gitignored** - never committed.

## How to load

1. Copy the template and fill in real values:

   ```bash
   cp packages/db/prisma/data/midwest.template.json \
      packages/db/prisma/data/midwest.json
   # edit midwest.json with the real services, prices, hours, address, admin
   ```

2. Point `DATABASE_URL` at the target database and run the migrations first:

   ```bash
   pnpm --filter @booking/db migrate:deploy
   ```

3. Run the loader:

   ```bash
   pnpm --filter @booking/db load:midwest
   # or a custom path:
   MIDWEST_DATA=/abs/path/to/data.json pnpm --filter @booking/db load:midwest
   ```

It prints a summary (`business`, `location`, `categories`, `services`,
`employees`, `adminEmail`). Run it again any time the data file changes.

## Field reference

| Path | Required | Notes |
| --- | --- | --- |
| `business.name`, `business.slug` | yes | `slug` is the stable upsert key; keep it constant. |
| `business.timezone` | recommended | IANA zone, e.g. `America/Chicago`. |
| `business.currency` | recommended | ISO code, e.g. `USD`. |
| `business.email`, `business.phone` | optional | Public contact details. |
| `website.publicKey` | yes | Stable upsert key for the widget; e.g. `pk_...`. |
| `website.domain` | optional | Set to the live domain or `null`. |
| `location.name` | yes | Upsert key within the business. |
| `location.address` .. `country`, `phone`, `email`, `instructions` | optional | Full address block. |
| `location.mode` | optional | `IN_PERSON` (default), `MOBILE`, or `VIRTUAL`. |
| `businessHours[]` | recommended | One row per open day. `dayOfWeek` 0=Sun..6=Sat. Set `isClosed: true` for closed days, else `openTime`/`closeTime` as `"HH:mm"`. Replaced on every run. |
| `categories[].name` | yes | Upsert key within the business; ordered as listed. |
| `categories[].services[].name` | yes | Upsert key within the business. |
| `categories[].services[].durationMinutes` | yes | Positive integer. |
| `categories[].services[].price` | optional | Number; defaults to `0`. |
| `categories[].services[]` other fields | optional | `bufferBeforeMinutes`, `bufferAfterMinutes`, `capacity`, `minAdvanceMinutes`, `maxAdvanceDays`, `color`, `isActive`. |
| `admin.email`, `admin.name` | yes | Mapped to the Administrator role. |
| `admin.password` | optional | Sets an initial password. Omit for magic-link-only sign-in. |
| `employees[]` | optional | Leave `[]` to create no staff. Match by `email` (or full name). `services` lists service names they provide; `workingHours[]` sets their schedule (replaced on every run). |

## Safety

- **No invented data.** The loader writes only what is in your file.
- **No fake bookings or customers.** Those tables are never touched.
- **Idempotent.** Keyed by slug / public key / names, so re-runs are safe.
- Real data stays local: `midwest.json` is gitignored.
