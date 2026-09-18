# Embedding the Booking Widget

The booking experience is a **single, framework-free script** that runs inside a Shadow DOM
(so it can't clash with the host site's CSS/JS) and talks only to the public API with a
**publishable key**. You can drop it onto any website — plain HTML, PHP/Laravel, WordPress,
Shopify, Webflow, React/Next — with one `<script>` tag and one element.

Everything below assumes the booking app is deployed at, say, `https://booking.example.com`
(your Vercel demo URL, or the client's `booking.clientdomain.com`). Replace that host in the
snippets. The widget automatically calls the API on the **same host the script is loaded from**.

---

## 1. The two things you need

1. **The script URL:** `https://booking.example.com/widget.js`
2. **A publishable key** (`Website.publicKey`). The demo seed ships `pk_demo_booking_123`.
   For a real client, create a `Website` row for their business with its own key (see
   *Creating a key* at the bottom). The key is **not a secret** — it only identifies the
   business and lets visitors read the catalogue and request a booking; the server authorizes
   and validates everything.

---

## 2. Inline embed (renders the flow in place)

Put this wherever you want the booking form to appear:

```html
<script src="https://booking.example.com/widget.js" defer></script>
<div data-booking-key="pk_demo_booking_123"></div>
```

That's it — the widget loads the business's branding (colour, font, corner radius) and the full
flow: **service → team member → date & time → details → confirmation**.

## 3. Popup button (launcher opens a modal)

```html
<script src="https://booking.example.com/widget.js" defer></script>
<div data-booking-key="pk_demo_booking_123"
     data-booking-mode="popup"
     data-booking-label="Book an appointment"></div>
```

## 4. A dedicated `/booking` page

Most sites want a menu link to a **Booking** page. Make a page at the `/booking` path on the
host site and drop the inline embed into it. Platform-by-platform:

### Plain HTML / PHP / Laravel
Create `booking.html` (or a `/booking` route / `booking.php`) containing your normal header/footer
and, in the content area:

```html
<h1>Book an appointment</h1>
<script src="https://booking.example.com/widget.js" defer></script>
<div data-booking-key="pk_demo_booking_123"></div>
```
In Laravel, that's a Blade view returned by a `Route::get('/booking', …)`.

### WordPress
1. **Pages → Add New**, title it *Booking* (the permalink becomes `/booking`).
2. Add a **Custom HTML** block with:
   ```html
   <div data-booking-key="pk_demo_booking_123"></div>
   <script src="https://booking.example.com/widget.js" defer></script>
   ```
3. Add *Booking* to the site menu. (If a security plugin strips `<script>` from post content,
   instead enqueue the script in the theme via `wp_enqueue_script` and keep only the `<div>` in
   the page.)

### Shopify
1. **Online Store → Pages → Add page**, title *Booking* (URL `/pages/booking`).
2. In the page editor, use the **`< >` (HTML)** mode and paste:
   ```html
   <div data-booking-key="pk_demo_booking_123"></div>
   <script src="https://booking.example.com/widget.js" defer></script>
   ```
   (If the theme sanitises inline scripts, add the `<script>` once in `theme.liquid` before
   `</body>` and keep just the `<div>` on the page.)

### Webflow
Add an **Embed** element on a `/booking` page containing the same `<div>` + `<script>` snippet,
then publish.

### React / Next.js
The script auto-initialises any `[data-booking-key]` in the DOM. A tiny wrapper:

```tsx
import { useEffect, useRef } from 'react';

export function BookingWidget({ publicKey }: { publicKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://booking.example.com/widget.js';
    s.defer = true;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);
  return <div data-booking-key={publicKey} ref={ref} />;
}
```
Then render `<BookingWidget publicKey="pk_demo_booking_123" />` on your `/booking` route.
(For the programmatic modal instead, call `window.BookingWidget.open({ publicKey })` on a click.)

---

## 5. Configuration (data-attributes)

| Attribute | Default | Purpose |
| --- | --- | --- |
| `data-booking-key` | — (**required**) | The business's publishable key. |
| `data-booking-mode` | `inline` | `inline` or `popup`. |
| `data-booking-label` | `Book now` | Popup launcher button text. |
| `data-booking-service` | — | Pre-select a service id (skips the service step). |
| `data-booking-primary` | from admin theme | Override the brand colour (e.g. `#e11d48`). |
| `data-booking-base` | script's origin | Override the API host (only if the script and API are on different hosts). |

### Programmatic API
```js
// Render into an element you control:
BookingWidget.render(document.querySelector('#slot'), { publicKey: 'pk_…' });
// Open the flow in a modal (e.g. from a nav "Book" link):
BookingWidget.open({ publicKey: 'pk_…' });
```

---

## 6. Branding

The widget's colour, font and corner radius come from the business's **Form Designer** settings
in the admin console (`/admin/form-designer`) — change them there and every embed updates, no
code change. `data-booking-primary` can override the colour per-embed.

---

## 7. CORS / domain locking

By default a key is **open** — it works when embedded on any site (what you want for a quick
demo or a "paste anywhere" key). To restrict a key to the client's own domain, set the
`Website.domain` field (e.g. `clientdomain.com`); the public API then rejects browser requests
from other origins (apex + `www` are both allowed). Leave `domain` null to keep it open.

The publishable key is safe to expose in page source — it grants only public catalogue/
availability reads and the ability to *request* a booking (which is created **pending** and
awaits admin approval). All real authorization is server-side.

---

## 8. Creating a key for a real client

There's no admin UI for websites yet (it's a noted follow-up), so create the `Website` row via
the seed or Prisma Studio:

```bash
pnpm --filter @booking/db studio   # open the Website table, add a row:
#   businessId = <the client's business id>
#   name       = "Client Site"
#   publicKey  = "pk_live_<random>"   (any unique string)
#   domain     = "clientdomain.com"   (or leave null for an open key)
#   isActive   = true
```

Or add it to `packages/db/prisma/seed.ts` alongside the business. Then embed that
`publicKey` on their site.

---

## Quick reference

- Hosted booking page (no embedding needed): `https://booking.example.com/book/<business-slug>`
- Widget script: `https://booking.example.com/widget.js`
- Live embed demo you can copy from: `https://booking.example.com/widget-demo.html`
