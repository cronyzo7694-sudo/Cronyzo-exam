#!/usr/bin/env bash
#
# Publish the built web app.
#
#   scripts/publish_site.sh            # build + copy into backend/static_site
#   scripts/publish_site.sh --commit   # ...and commit so Render serves it
#
# The same dist also gets pushed to Cloudflare Workers (see DEPLOY.md); this
# script is the zero-dashboard fallback so the live site is never stale.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"

echo "▸ building frontend…"
npm run build

echo "▸ copying dist → backend/static_site"
rm -rf "$ROOT/backend/static_site"
mkdir -p "$ROOT/backend/static_site"
cp -R "$ROOT/frontend/dist/." "$ROOT/backend/static_site/"

echo "▸ published $(du -sh "$ROOT/backend/static_site" | cut -f1)"

if [[ "${1:-}" == "--commit" ]]; then
  cd "$ROOT"
  git add -A backend/static_site
  git commit -q -m "Publish web build (served by the API host)" || echo "nothing to commit"
  git push -q origin main
  echo "▸ pushed — Render redeploys in ~1–3 min"
fi
