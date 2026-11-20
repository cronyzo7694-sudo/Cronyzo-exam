#!/usr/bin/env bash
# Full, read-only backup of the live database into the workspace.
#
#   bash backend/scripts/backup_db.sh
#
# Reads DATABASE_URL from backend/.env and writes a timestamped SQLite copy to
# backend/backups/. The source database is only ever READ — nothing is deleted,
# truncated or altered. Run this before any maintenance.
set -euo pipefail
cd "$(dirname "$0")/.."

URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')
if [ -z "${URL:-}" ]; then
  echo "DATABASE_URL not found in backend/.env" >&2
  exit 1
fi

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="sqlite:///$(pwd)/backups/cronyzo-$STAMP.db"

echo "→ backing up to backups/cronyzo-$STAMP.db (source stays untouched, read-only)"
.venv/bin/python scripts/db_copy.py --from "$URL" --to "$OUT"
echo "✓ backup ready: backend/backups/cronyzo-$STAMP.db"
