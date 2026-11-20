#!/usr/bin/env python3
"""Copy the whole Cronyzo database from one Postgres/SQLite URL to another.

Use it to move off a database that ran out of quota onto a fresh free one:

    python scripts/db_copy.py \
        --from "postgresql://user:pass@old-host/db" \
        --to   "postgresql://user:pass@new-host/db"

The schema is created from the source (so column types match) and every row is
copied table by table in foreign-key order, in chunks. Safe to re-run: pass
``--truncate`` to wipe the target first, otherwise existing rows are merged
(primary-key conflicts are skipped, not overwritten).

Nothing is deleted from the source — it stays exactly as it was.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import MetaData, create_engine, insert, select, text  # noqa: E402

CHUNK = 500


def _engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(url, future=True)
    return create_engine(url, future=True, pool_pre_ping=True, connect_args={"connect_timeout": 20})


def main() -> int:
    ap = argparse.ArgumentParser(description="Copy a Cronyzo database")
    ap.add_argument("--from", dest="src", required=True, help="source DATABASE_URL")
    ap.add_argument("--to", dest="dst", required=True, help="target DATABASE_URL")
    ap.add_argument("--truncate", action="store_true", help="empty the target first")
    ap.add_argument("--skip-files", action="store_true", help="skip stored_files blobs (PDFs)")
    args = ap.parse_args()

    src = _engine(args.src)
    dst = _engine(args.dst)

    meta = MetaData()
    meta.reflect(bind=src)
    meta.create_all(bind=dst)
    print(f"· schema ready on target ({len(meta.tables)} tables)")

    if args.truncate:
        with dst.begin() as conn:
            if dst.dialect.name == "postgresql":
                names = ", ".join(f'"{t.name}"' for t in reversed(meta.sorted_tables))
                conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
            else:
                for table in reversed(meta.sorted_tables):
                    conn.execute(text(f'DELETE FROM "{table.name}"'))
        print("· target emptied")

    grand_total = 0
    for table in meta.sorted_tables:
        if args.skip_files and table.name == "stored_files":
            continue
        with src.connect() as sconn:
            rows = [dict(r._mapping) for r in sconn.execute(select(table))]
        if not rows:
            print(f"  {table.name:<28} 0")
            continue
        copied = 0
        with dst.begin() as dconn:
            for start in range(0, len(rows), CHUNK):
                batch = rows[start : start + CHUNK]
                if dst.dialect.name == "postgresql":
                    from sqlalchemy.dialects.postgresql import insert as pg_insert

                    stmt = pg_insert(table).values(batch).on_conflict_do_nothing()
                else:
                    from sqlalchemy.dialects.sqlite import insert as lite_insert

                    stmt = lite_insert(table).values(batch).on_conflict_do_nothing()
                result = dconn.execute(stmt)
                copied += result.rowcount if result.rowcount and result.rowcount > 0 else 0
        grand_total += len(rows)
        print(f"  {table.name:<28} {len(rows)} rows read, {copied} new")

    print(f"\n✓ done — {grand_total} rows inspected. Source untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
