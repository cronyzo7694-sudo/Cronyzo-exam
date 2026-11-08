# Regression harness

Headless-browser smoke tests for the whole app. They catch the class of bug
that `tsc` and `vite build` cannot: runtime errors, blank pages, failed API
calls and broken navigation.

## Setup (one-off)

```bash
npm install --prefix /tmp/pw playwright
npx playwright install chromium
```

Playwright is intentionally **not** a dependency of `frontend/` — it would add
~125 MB of browser binaries to every install, and the app itself does not need it.

## Run

With the backend on `:5000` and Vite on `:5173`:

```bash
node scripts/check_landing.cjs    # flag strip, hero carousel, header search, mobile bottom nav
node scripts/check_pages2.cjs     # 14 public + 4 admin routes, console-error-free
node scripts/check_pages.cjs      # every public page — console errors, node count, rendered text
node scripts/check_auth.cjs       # student / seller / teacher / admin — logs in, visits each guarded page
node scripts/check_nav.cjs        # sidebar contents per role (creator-only and admin-only items)
node scripts/check_identity.cjs   # guest → claim → become-a-creator → publish, end to end
node scripts/check_claim_ui.cjs   # the "keep your progress" claim panel on /login
node scripts/check_publish.cjs    # seller publishes a product, confirms it lands in "My products"
node scripts/check_delete.cjs     # delete confirmation flow (first click asks, second confirms)
node scripts/check_screens.cjs    # writes PNGs to docs/screens/
```

Point them at another host with `BASE=https://your-domain`:

```bash
BASE=https://cronyzo.app node scripts/check_auth.cjs
```

## What they assert

- HTTP 200 on every route
- no `pageerror` / console errors / failed same-origin requests
- the page actually rendered content (DOM node count + visible text length)
- no unintended redirects (a guard bouncing you to `/login` is a failure)
- publishing and deleting a listing round-trips correctly

The scripts leave no test data behind — `check_publish.cjs` and `check_delete.cjs`
clean up the rows they create.
