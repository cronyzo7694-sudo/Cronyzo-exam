# Cronyzo

**One platform to Learn, Read, Shop and Test.**

Cronyzo merges nine separate GitHub projects into a single startup product:

| Pillar | What it does | Who it serves |
|---|---|---|
| **Courses** | Teachers publish courses with modules + lessons; students enrol and track progress | Teachers, students |
| **Books** | Sellers list books with author, ISBN, pages and a table of contents | Booksellers, students |
| **Shop** | Vendors list goods with live stock, storefronts, reviews and wishlists | Vendors, students |
| **Test** | The CBT exam engine — mock papers, timed attempts, analytics, question bank | Students, admins |

Monorepo layout:

```
cronyzo/
├── backend/     Flask + SQLAlchemy + JWT  (API under /api/*)
└── frontend/    React + Vite + TypeScript + Tailwind + TanStack Router/Query
```

---

## Run it locally

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m flask --app app:create_app run --host=0.0.0.0 --port=5000
```

The database (`backend/cronyzo.db`, SQLite) is created and seeded automatically on
first boot. Health check: `http://127.0.0.1:5000/api/health`.

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Vite proxies `/api` → `http://127.0.0.1:5000`, so the browser only ever talks to
one origin.

### Admin account

There is exactly **one** admin, created in the database — never in code:

```
email    = whatever you set (the live one is your own Gmail)
password = set by you, from Admin → Settings (or the reset script)
```

No credentials exist in this repository. `backend/scripts/seed.py` reads the
bootstrap admin from `CRONYZO_ADMIN_EMAIL` / `CRONYZO_ADMIN_PASSWORD` and
generates a random password when they are absent, so a public repo can never
hand out a working login. Demo inventory (and demo logins) only appear when
`CRONYZO_SEED_DEMO=1`.

> First-user bootstrap: `POST /api/auth/register` honours `role=admin` **only
> when the database has no admin at all** — that is how the first account is
> created. Every later attempt is silently downgraded to `student`.

---

## Seed data

The commerce seed is idempotent — it keys off `Category.slug == "electronics"` and
skips everything that already exists.

| | |
|---|---|
| Courses | 9 (54 lessons across modules) |
| Books | 9 (with chapters) |
| Products | 18 across 6 categories |
| Stores | 2 (TechNest India, Loom) |
| Creators | 3 teachers, 2 sellers |
| Coupons | 3 |

Pricing rules live in `backend/app/services/commerce.py`:

- platform commission **12%** on every completed sale
- shipping **free over ₹999**, otherwise flat **₹49**
- coupons apply `max(percent, flat)`
- checkout auto-enrolls course items and decrements product stock

---

## One identity across the whole web app

The four pillars are not separate apps that happen to share a database — they
are one account system. A person who starts as a guest, takes a mock test,
adds a book to their cart, buys a course and then opens a storefront is
**one account**, the whole way through.

### How it works

**The server is the single source of truth for permissions.**
`GET /api/auth/session` returns the caller plus the capabilities the server
resolved:

```json
{
  "user": { "id": 2, "email": "aarav@example.com", "role": "seller", ... },
  "role": "seller",
  "creator_type": "seller",
  "is_guest": false,
  "capabilities": {
    "can_publish_courses": true,
    "can_publish_books": true,
    "can_sell_products": true,
    "can_take_exams": true,
    "can_manage_exams": false,
    "can_administer": false
  }
}
```

The frontend never re-derives permissions from a role string. The sidebar,
the route guards and every "Sell" button read those capabilities, so the UI
and the API can never disagree.

**Role changes take effect immediately.** The JWT's `role` claim is a
snapshot, so authorisation resolves the *live* role from the `users` row
(`app/utils/decorators.py::roles_required`). A student who becomes a teacher
through `/api/creator/become-creator` can publish a course on the very next
request — no re-login, no stale-claim 403.

**A guest session can be claimed in place.** `POST /api/auth/claim` upgrades
the *same* `users` row (email, password, name, role). Because every other
table points at that row, the guest's attempts, lesson progress, cart,
wishlist, enrollments and orders simply keep working — no data migration, no
second person. The login page detects an active guest session and offers
"Save my progress" instead of a second competing email/password form.
`POST /api/auth/register` does the same automatically when a guest token is
present.

**One `users` table, one token, one client.** There is a single JWT, a single
`access_token` in local storage, and a single API client (`src/lib/api.ts`)
that every module — commerce, exams, admin — goes through.

### The identity flow

```
visitor ──► Continue as guest ──► guest session (role=guest)
                                         │
                        takes a test, fills a cart, browses
                                         │
                                         ▼
                        POST /api/auth/claim  (same row)
                                         │
                                         ▼
                     full account ──► role=student
                                         │
                        POST /api/creator/become-creator
                                         │
                                         ▼
                    role=teacher | seller   → publishes courses/books/products
```

### Demo accounts

| Role | Email | Password | Can |
|---|---|---|---|

The demo accounts' roles are re-asserted on every boot, so a manual promotion
during testing can never permanently change the demo.

---

## Selling flow

1. Sign in → **Sell** (`/sell`) → pick *teacher*, *seller* or *both* → this sets
   `creator_type` on the account.
2. **Seller Studio** (`/sell/dashboard`) — earnings hero, catalogue counts, recent
   sales, best performers.
3. Publish: `/sell/products/new`, `/sell/courses/new`, `/sell/books/new`.
   Uploads accept a plain image URL, so a Cloudinary URL can be pasted in later
   with no code change.
4. **My catalogue** — `/sell/products`, `/sell/books`, `/sell/courses` list only
   your own listings (`?mine=true` on the public list endpoints) and support
   remove-with-confirmation.
5. **Earnings report** (`/sell/earnings`) — every sale with gross, platform fee
   and exact payout.

A course needs modules and lessons before students can consume it; those are
created through `POST /api/courses/<id>/modules` and
`POST /api/courses/<id>/modules/<module_id>/lessons`.

---

## API map

All commerce endpoints live under `/api`:

| Blueprint | Prefix | Covers |
|---|---|---|
| `auth_bp` | `/api/auth` | register, login, guest, **claim**, **session**, refresh, me |
| `courses_bp` | `/api/courses` | catalogue, detail, publish, modules, lessons, enroll, reviews |
| `my_courses_bp` | `/api/my` | enrolled courses, lesson progress |
| `books_bp` | `/api/books` | catalogue, detail, publish, chapters |
| `shop_bp` | `/api/shop` | products, categories, stats, reviews, wishlist |
| `cart_bp` | `/api/cart` | server-authoritative cart |
| `account_bp` | `/api/account` | saved delivery addresses |
| `orders_bp` | `/api/orders` | checkout, order history, cancellation |
| `creator_bp` | `/api/creator` | become-creator, dashboard, earnings |
| `stores_bp` | `/api/stores` | public storefronts |
| `profiles_bp` | `/api/profiles` | public creator profiles |

Exam domain (`/api/exams`, `/api/questions`, `/api/attempts`, `/api/analytics`,
`/api/admin/*`) comes from the original exam engine and is unchanged.

---

---

## The marketing surface is data, not markup

Every word a visitor reads on the landing page lives in the database and is
edited at **Admin → Site content**. A copy change is a form save, not a deploy.

| What | Where it comes from |
|---|---|
| Identity strip line + the waving 🇮🇳 flag | `site_settings` `strip.*` |
| Hero eyebrow / H1 / paragraph / search placeholder / popular tags | `site_settings` `hero.*` |
| Hero carousel (4 animated artwork slides) | `hero_slides` |
| "Four pillars" cards — icon, title, copy, bullets, link | `pillar_cards` |
| Section headings ("Top courses", "Teach a course…", etc.) | `site_settings` `sections`/`courses`/`sell` |
| Testimonial carousel | `testimonials` |
| Footer blurb, copyright, support email | `site_settings` `footer.*`, `support.*` |
| Feature switches (guest browsing, guest checkout, carousel, flag) | `site_settings` `feature.*` |

`GET /api/site/home` returns content **plus** live counters **plus** catalogue
previews in a single round trip. Every counter is a real `COUNT(*)`:

* a vertical with no rows contributes **no card** — the strip never shows an
  empty tile,
* the category rail drops any category with zero live products,
* the "Top courses" / books / gear sections render only when that catalogue has
  published rows,
* a section is simply absent on a brand-new install, never blank.

The frontend caches the payload in `src/lib/site.ts` and falls back to shipped
defaults if the request fails — an operator never sees an empty headline because
the API restarted.

---

## The dashboard

`/dashboard` is the commerce-first home (`pages/CronyzoDashboardPage.tsx`):

| Block | Source | Rule |
|---|---|---|
| Greeting + role badge | session | "Good morning/afternoon/evening", first name only |
| Live counters | enrollment / cart / order APIs | courses, basket, orders |
| Continue learning | `GET /api/my/courses` | only unfinished courses, with real progress bars |
| Your basket | cart store | hidden when the cart is empty |
| Recent orders | `GET /api/orders/my` | last three, hidden when there are none |
| Recommended for you | `GET /api/site/featured` | only rendered when the catalogue has rows |
| Jump to | — | six shortcuts: tests, learning, books, stores, attempts, selling |
| Guest nudge | session | "Keep this account" → `/login` (claim keeps the same row) |

Every section disappears when its data is empty, so a fresh account never sees a
wall of zeros or a placeholder card.

The original exam-first dashboard (donut goals, achievements, streak, donation
block) still exists — it moved to **`/dashboard/exams`** and is no longer linked
from the main flow.

---

## One chrome for the whole product

The brief was blunt: *“it feels like several websites stitched together.”*
Three things caused it, all fixed:

| Cause | Fix |
|---|---|
| The signed-in workspace had its **own header and its own logo row** | `SiteHeader` is now a single component rendered by every layout — public, workspace, seller studio, admin, login, register |
| The mobile bottom bar differed between sections | one exported `MobileBottomNav` (Home · Learn · Shop · Search · You) everywhere |
| Every page picked its own container width (900 / 1200 / 1400 / 5xl) and padding | one content width: `max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8` |

```
SiteHeader          logo · nav · search · cart · account        ← identical everywhere
TopStrip            🇮🇳 admin-editable line · Need help?
├─ workspace sidebar  (only on signed-in routes, docks *under* the header)
└─ main content       max-w-1200
MobileBottomNav     Home · Learn · Shop · Search · You
```

`AppLayout` no longer draws a second top bar: it renders `SiteHeader`, then the
sidebar docks below it (`sticky top-16`). Moving from the landing page into the
dashboard, the seller studio or the admin console **never changes the chrome** —
only the sidebar and the page body do.

Deliberate exceptions:

* **Landing page** keeps a full-bleed `1400px` canvas — marketing needs the width,
  but it uses the same header, strip, footer and buttons.
* **Exam player** (`/play/…`) stays full-screen: an exam must not have navigation
  competing with a running timer.

---

## Navigation and layout

The same page structure on every public route:

```
desktop   ┌──────────────────────────────────────────────────────┐
          │ logo · nav · [ SEARCH — always visible ] · cart · CTA │
          ├──────────────────────────────────────────────────────┤
          │ 🇮🇳  operator-editable strip line        · Need help? │
          └──────────────────────────────────────────────────────┘

mobile    fixed bottom bar:  Home · Learn · Shop · [Search] · You
```

* **Desktop:** the search field is part of the header. It is never collapsed
  into an icon or a menu.
* **Mobile:** there is no header search box at all. Search is a primary tab in
  the bottom bar, where a thumb can reach it, and it opens a full-height sheet
  with the popular-search chips.
* **One call to action.** A signed-out visitor sees exactly one button
  ("Sign in" — the login page carries "Create an account"). The old
  "Sign in **and** Get started" pair is gone, because both led to the same place.
* **Signed in?** The header swaps that button for **Dashboard**.
* **On the sign-in page**, a guest sees "Go to dashboard as guest" so they are
  never trapped on a login screen.

The signed-in workspace (`AppLayout`) keeps its desktop sidebar + top bar and
its own mobile bottom bar.

---

## Sign-in options

| Method | Status | Notes |
|---|---|---|
| Email + password | Live | The primary path |
| Continue as guest | Live | One tap, no email. Auto-creates a session with two demo enrollments so My Learning is explorable |
| **Continue with Google** | **Live in testing mode** | Works right now; becomes real Google/Firebase the moment keys are added |
| Phone OTP | Off by default | Set `ENABLE_PHONE_OTP=true` |

### Google / Firebase

`GET /api/auth/methods` reports the mode, and the button always renders:

| `google_mode` | When | Behaviour |
|---|---|---|
| `firebase` | `FIREBASE_PROJECT_ID` set | Verifies the Firebase ID token (RS256 against Google's rotating certs, `aud`/`iss`/`exp` checked) |
| `gis` | `GOOGLE_CLIENT_ID` set | Verifies a Google Identity Services credential via tokeninfo |
| `demo` | neither set | Signs in a clearly-labelled demo Google account so the flow is testable today |

Switching to real accounts is **backend-only**: set `FIREBASE_PROJECT_ID` (and
the Firebase web config in the frontend build env) or `GOOGLE_CLIENT_ID`, restart
the API. No component changes.

### What a guest can and cannot do

A guest is a real `users` row, so everything behaves exactly like a signed-in
account: cart, wishlist, exams, attempts, lesson progress, My Learning.

The one hard rule is money:

```
POST /api/orders/checkout   → 403 { code: "guest_cannot_purchase" }
```

Buying requires a saved account. The operator can relax this in
`Admin → Site content → feature.guest_can_purchase` for internal demos, but the
default is off.

When the guest finally saves the account, `POST /api/auth/claim` upgrades **the
same row** — cart, attempts and progress come with them, untouched.

---

## Teaching: courses, live classes, PDFs

A teacher's workspace is `/sell/courses/<id>/studio`.

**Curriculum.** Modules → lessons. A lesson is a YouTube video, an article, a
PDF download, a live session or a quiz. Any lesson can be marked a **free
preview** so a visitor can sample the teaching before paying.

**Live classes** (`live_classes`) — schedule a session with a date, a duration
and a link. `provider` is `youtube | zoom | meet | internal | other`, and a bare
YouTube URL is normalised to its watch form.

The join link is the paid asset. `GET /api/courses/<id>/live` returns
`join_url` **only** to the owning teacher, an admin, or an enrolled student —
everyone else gets the class title and time but no way in.

**PDF library** (`lesson_files`) — notes, worksheets, past papers. Upload is
hardened (type sniffing, 50 MB cap, random filename, path-traversal-proof
serving at `/api/files/…`). Files are visible to the owner and to enrolled
students; visitors see only the ones marked `is_preview`.

**Announcements** (`announcements`) — a course-scoped notice, or platform-wide
when the author is an admin.

---

## Books: PDF editions, free samples, free downloads

A book listing can carry two PDFs:

| Field | Meaning |
|---|---|
| `pdf_url` | The full e-book. Handed out by `GET /api/books/<id>/download` |
| `preview_pdf_url` | A free sample. Public via `GET /api/books/<id>/preview` |
| `is_free_download` | The whole title is free — no purchase, no signup |

**Who gets the full PDF?**

```
is_free_download                  → anyone
seller/admin owns the listing     → always
buyer has a paid order for it     → yes
otherwise                         → 402 { code: "payment_required" }
```

The PDF bytes never appear in a public payload — `Book.to_dict()` exposes only
`has_pdf`, `has_preview` and `pdf_name`. The seller sets the price on the
listing; tick "free to download" and it publishes at ₹0 under "Free e-books".

**Publishing is PDF-only.** The listing form opens with *Sell this as a PDF
e-book* already ticked, and the PDF is required: the file is checked **before**
the listing request goes out, so a missing PDF can never leave a published book
nobody can open. Untick the box only for a physical title (those keep stock +
shipping, and are the only listings without a PDF).

---

## Chat and support

Two different things, one bubble.

**Messages** (`/chat`) — real 1:1 conversations between members: a learner
asking a teacher, a buyer asking a seller. Threads are unique per pair, delivered
by cursor polling (`?after=<id>`) so it works behind any proxy without a
websocket server, with an unread badge. Guests are blocked (`403
guest_cannot_chat`) — an anonymous row has nobody to talk to.

**Help** — the contact form and the floating widget. Guests are welcome; asking
for help must never require an account.

### Telegram

Every help message is mirrored to the operator's Telegram so it reaches a phone
in seconds.

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
```

Get the token from **@BotFather**, message your bot once, then read `chat.id`
from `https://api.telegram.org/bot<TOKEN>/getUpdates`.

Verify the wiring at **Admin → Site content → Integrations → Send a test
message**.

**Two-way, from the phone.** The operator answers by *replying* to the
notification in Telegram — no need to open a browser:

```
telephone ──swipe-reply──▶ Telegram ──getUpdates──▶ ContactReply(channel="telegram")
                                                        │
                                                        └─▶ Admin → Support inbox
                                                            + the visitor's own ticket view
```

* `notify_contact_ticket` stores the `message_id` Telegram assigned
  (`contact_tickets.telegram_message_id`), which is the join key.
* A daemon started at boot (`start_poller`, `TELEGRAM_POLL_SECONDS`, default 8s)
  long-polls `getUpdates`, remembers its cursor in
  `site_settings.telegram.update_offset` so a restart never replays old replies,
  and ignores anything from a chat other than `TELEGRAM_CHAT_ID`.
* `#123 your answer` works as a typed fallback when the operator wants to quote
  a ticket instead of swiping to reply.
* Replies are stored with `channel` = `telegram` or `panel`, and the inbox
  labels which one came from a phone.

**Fail-soft by design.** Without the variables the ticket is still stored and
listed in **Admin → Support inbox**, which shows a per-ticket Telegram delivery
badge — nothing is ever lost because a bot was not configured, and the poller
simply logs `telegram inbound poller idle`.

Guards: `CRONYZO_DISABLE_WORKERS=1` turns the poller off (tests, multi-worker
deploys where one worker should own the bot); `TELEGRAM_POLL_SECONDS=0` disables
it too; under the Werkzeug reloader only the child process polls.

---

## Ask-a-human surfaces

| Route | What it is |
|---|---|
| `/help` | Topic tiles, direct email line, FAQ accordion |
| `/contact` | The form. `?topic=order` pre-selects the tile |
| `/admin/support` | Inbox: every ticket, Telegram delivery state, replies |
| Floating bubble | Same form, one tap from any page (hidden on `/play/*` and `/checkout`) |
| `/chat` | Real member-to-member messaging |

---

## Uploads and storage

All uploads go through `app/services/storage.py`, which picks a backend at
runtime:

| Backend | When |
|---|---|
| `local` | Default. `backend/uploads/`, served by `GET /api/files/<path>` |
| `cloudinary` | `CLOUDINARY_URL` (or the three `CLOUDINARY_*` vars) set **and** the SDK installed |

Set the env vars and `pip install cloudinary` and every **new** upload lands on
Cloudinary — no route, model or frontend change. `uploads/` is gitignored.

Serving local files is path-traversal-proof (`send_from_directory` after a
`resolve()`/`relative_to()` check).

---

## API additions (this layer)

| Blueprint | Prefix | Covers |
|---|---|---|
| `site_bp` | `/api/site` | `content`, `stats`, `featured`, `home` |
| `admin_site_bp` | `/api/admin/site` | settings, hero slides, pillars, testimonials, telegram test |
| `chat_bp` | `/api/chat` | threads, messages, unread |
| `contact_bp` | `/api/contact` | submit, lookup, admin tickets + replies |
| `teaching_bp` | `/api/teaching` | upload, live classes, lesson files, announcements |
| `files_bp` | `/api/files` | serve locally stored uploads |

Existing routes changed:

* `POST /api/auth/google` — Firebase + demo modes, same URL
* `GET /api/auth/methods` — reports `google_mode` and `firebase_project_id`
* `POST /api/auth/guest` — seeds two demo enrollments
* `POST /api/orders/checkout` — 403 for guests unless explicitly allowed
* `GET /api/books/<id>/…` — `download`, `preview`, `pdf`, `preview-pdf`

---

## Schema

New tables: `site_settings`, `hero_slides`, `pillar_cards`, `testimonials`,
`chat_threads`, `chat_messages`, `contact_tickets`, `contact_replies`,
`live_classes`, `lesson_files`, `announcements`.

New columns on existing tables (added by
`app/services/schema_upgrade.py::ensure_additive_schema`, which runs on boot and
is **purely additive** — no drops, no retypes, failures logged and skipped):
`books.*` digital edition, `lessons.file_url/youtube_url/is_live`,
`courses.level/has_live_classes/language`.

> `db.create_all()` creates missing *tables* but never adds missing *columns* to
> a table that already exists. That module closes the gap for additive changes
> so an existing SQLite database upgrades itself on restart. Destructive changes
> belong in Alembic.

---

## Live configuration (current state)

`backend/.env` and `frontend/.env` currently hold **real** credentials.
`Admin → Integrations` proves it by calling each provider.

| Service | State | What it means |
|---|---|---|
| **Database** | 🟢 **Neon Postgres** | `ep-long-recipe-…ap-southeast-1.aws.neon.tech/neondb`, seeded and durable |
| **Google sign-in** | 🟢 **Firebase `kineora-exam`** | Real Google popup → real ID token → server-side verification |
| **Telegram** | 🟢 **two bots** | `@asoom7691_bot` (students/courses) + `@Cronyzo_bot` (orders/sellers) |
| **File storage** | 🟢 **Cloudinary** | `dvno8qwg8` — PDFs, covers and class files on the CDN |
| **Payments** | 🟡 **dummy** | Slot ready: paste Razorpay keys, nothing else changes |

> One manual step remains in the Firebase console: **Authentication → Sign-in
> method → Google → Enable**, and add `localhost:5173` (plus the production
> domain later) to **Authentication → Settings → Authorized domains**. The
> code path is already live — the popup reaches Firebase today.

### Two Telegram bots, one inbox

The operator wanted shop traffic and study traffic in separate chats:

```
topic = order | product | seller | store | shipping | return | refund | payment
        └─► @Cronyzo_bot        (shopping)

everything else (course, exam, account, general)
        └─► @asoom7691_bot      (students)
```

Both bots deliver to the same operator chat (`TELEGRAM_CHAT_ID`), and **both**
are polled for replies, so whichever phone notification you swipe-reply to, the
answer lands in the right ticket. The inbox labels which bot carried it.

### Payments: dummy now, real the moment keys arrive

```
PAYMENTS_MODE=auto      → razorpay if RAZORPAY_KEY_ID + SECRET exist, else dummy
PAYMENTS_MODE=dummy     → force the sandbox even with keys (safe demos)
```

The checkout already speaks the gateway protocol:

```
GET  /api/payments/config    → { mode, key_id, checkout_script }
POST /api/payments/order     → recomputes the cart server-side, creates the order
POST /api/payments/verify    → HMAC-SHA256 signature check, records the Payment
POST /api/payments/webhook   → Razorpay server-to-server confirmation
```

With dummy mode the two POSTs succeed locally and no money moves. Paste
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (and optionally
`RAZORPAY_WEBHOOK_SECRET`), restart the API, and **the same click opens the real
Razorpay sheet** — no frontend change, no redeploy.

### Postgres found two SQLite-only assumptions (fixed)

1. `db.create_all()` never ALTERs. `ensure_additive_schema` now also widens
   artwork URL columns to `TEXT` on Postgres.
2. Inline SVG artwork (~2 KB data URIs) overflowed `VARCHAR(512)` on
   `users.avatar_url`, `stores.logo_url`, book/course covers — SQLite ignores
   lengths, Postgres does not. Those columns are `Text` in the models now, so the
   seed can never die on a real database again.

---

## Turning the outside world on (Admin → Integrations)

`/admin/integrations` is the proof screen. It does not read a flag — it calls
the provider and reports what came back:

| Card | What "LIVE" actually means |
|---|---|
| **Database** | A real `SELECT 1` round-trip; shows SQLite (test) or your Neon host |
| **Google sign-in** | Firebase mode fetches Google's live signing certs; GIS mode reports the client id |
| **Telegram support bot** | `getMe` proves the token, `getChat` proves the bot can reach your chat |
| **File storage** | Writes and removes a probe file (local) or confirms Cloudinary is configured |
| **Payments** | Whether Razorpay keys are present |

Every row is one of four states, and each carries the exact environment
variable names plus the fix:

```
LIVE            configured and the provider just answered
TEST MODE       working on the built-in fallback (SQLite, demo Google, local disk)
NOT CONNECTED   nothing set — the feature is simply absent, nothing is broken
NEEDS ATTENTION configured but the provider refused — the server's own words
```

**Test now** re-runs a single probe without leaving the page. Secrets never
leave the server: the response contains modes, host names and provider error
text only.

Values live in **`backend/.env`** (gitignored, `backend/.env.example` documents
every key). The file is read once at boot — restart the API after editing it.

### What each credential unlocks

| Paste this | And this happens |
|---|---|
| `GOOGLE_CLIENT_ID` | The existing "Continue with Google" button starts verifying **real** Google accounts (Google Identity Services — fastest path, one value) |
| `FIREBASE_PROJECT_ID` | Same button, Firebase ID tokens instead |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Help messages reach your phone **and** your phone replies land back in the ticket |
| `DATABASE_URL` | Site moves to Neon/Postgres on next boot, data intact |
| `CLOUDINARY_URL` | New uploads go to Cloudinary's CDN |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | Online card/UPI checkout can be enabled |

---

## Configuration

Everything is environment-driven — nothing is hard-wired to a specific host.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///cronyzo.db` | Point at Neon/Postgres by setting this |
| `SECRET_KEY` / `JWT_SECRET_KEY` | dev fallbacks | **Set these before deploying** |
| `CORS_ORIGINS` | localhost + cronyzo.app | Comma-separated allow-list |
| `CRONYZO_APP_NAME` | `Cronyzo` | Brand name |
| `CRONYZO_TIMEZONE` | `Asia/Kolkata` | Display timezone |
| `CRONYZO_CONFIG_FILE` | `backend/cronyzo.config.json` | Feature flags / platform config |
| `UPLOAD_FOLDER` | `backend/uploads` | Where media lands |
| `VITE_API_URL` | `/api` | Frontend API base |
| `FIREBASE_PROJECT_ID` | — | Real Google sign-in (recommended) |
| `GOOGLE_CLIENT_ID` | — | Real Google sign-in (GIS alternative) |
| `TELEGRAM_BOT_TOKEN` | — | Support messages → your phone |
| `TELEGRAM_CHAT_ID` | — | Target chat for support messages |
| `TELEGRAM_POLL_SECONDS` | `8` | Inbound reply polling; `0` disables |
| `CRONYZO_DISABLE_WORKERS` | — | `1` = never start background daemons |
| `CLOUDINARY_URL` | — | Switch uploads to Cloudinary |

### Moving to Neon later

The SQLAlchemy layer is already Postgres-compatible. Set `DATABASE_URL` to the
Neon connection string, then run the migrations:

```bash
cd backend
.venv/bin/alembic upgrade head
```

`backend/migrations/` already exists and `alembic.ini` points at the app
metadata, so no code change is required.

### Moving to Cloudinary later

Uploads already route through `app/services/storage.py`, which chooses the
backend at call time:

```bash
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
pip install cloudinary
```

Restart the API and every **new** upload goes to Cloudinary. Existing local
files keep working (their URLs are absolute `/api/files/…` paths). No route,
model or frontend change.

---

## Notes

- Legal pages (`/terms`, `/privacy`, `/refund`, `/about`, `/help`) are **public**
  by design — payment gateways and app stores require them to be readable
  without an account.
- Placeholder artwork is generated server-side as deterministic SVG data URIs
  (`backend/app/services/media.py`), so the catalogue never shows broken images.
  Aspect ratios match the card ratios exactly (course 16:10, book 3:4, product
  1:1).
- `backend/scripts/regenerate_artwork.py` rewrites stored artwork in place
  without touching orders or enrollments.

---

## Publishing gate (shopkeeper approval)

Nothing is listed on Cronyzo by accident: a member must be an **approved
shopkeeper** before they can publish. Admins bypass the queue and publish
directly, as before.

| Step | Route | Who |
| --- | --- | --- |
| Apply | `POST /api/seller/apply` · `/sell/apply` | any signed-in member |
| Status | `GET /api/seller/application` · `/sell` | the applicant |
| Queue | `GET /api/admin/seller/applications` · `/admin/sellers` | admin |
| Decide | `POST /api/admin/seller/applications/<id>/review` (`approve｜reject｜suspend`) | admin |

- `POST /api/books` and `POST /api/shop/products` answer
  **403 `{"code": "seller_application_required", "next": "/sell/apply"}`**
  until the application is approved (`is_approved_seller()` in
  `backend/app/models/seller.py`).
- Approving flips the account to `role="seller"` and `creator_type`
  `seller` / `both`. Every application (and every approval) pings the operator
  on Telegram.
- The frontend half is `components/seller/ShopkeeperGate.tsx`: it wraps the
  product and book forms and explains the next step instead of letting someone
  fill a form the API will reject. `/sell` reads the same status and shows
  *Apply* / *Under review* / *Open your seller studio* accordingly.
- Courses are a **teacher** capability (`role=teacher`), not shop inventory, so
  they are not part of this gate.

## Zero dummy data

A live shop must never show sample inventory. Two rules enforce it:

1. **Seeding is off by default.** `create_app()` no longer seeds on boot;
   `CRONYZO_SEED_DEMO=1` brings the sample catalogue back for a throwaway demo
   environment. (Landing copy in `site_settings` still upserts — that is the
   text layer the admin edits, not inventory.)
2. **Empty means empty.** Catalogue, store and category sections render only
   when the API returns rows; otherwise each page shows its own "nothing here
   yet" state with a call to action.

To wipe inventory at any time:

```bash
cd backend
.venv/bin/python scripts/purge_demo_data.py --yes   # TRUNCATE … CASCADE over 44 content tables
```

Kept on purpose: `users` (your logins keep working), `site_settings`,
`hero_slides`, `pillar_cards`, `testimonials`, `notification_templates` —
editorial content you edit from **Admin → Site Content**, never sample stock.