#!/usr/bin/env python3
"""Report what actually eats the database quota.

Free managed Postgres has two walls: storage (often 0.5 GB) and compute hours.
This prints row counts, how many megabytes the uploaded PDFs/covers take, and
which tables are the heaviest — the honest picture before buying more space.

    python scripts/db_report.py            # uses DATABASE_URL from .env
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv


def main() -> int:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    from app import create_app
    from app.extensions import db

    app = create_app()
    with app.app_context():
        engine = db.engine
        print(f"database: {engine.url.render_as_string(hide_password=True)}")
        rows = db.session.execute(
            db.text(
                "SELECT table_name, "
                "pg_total_relation_size(quote_ident(table_name)) AS bytes "
                "FROM information_schema.tables WHERE table_schema = 'public' "
                "ORDER BY bytes DESC"
            )
        ).fetchall()
        total = 0
        print("\nheaviest tables")
        for name, size in rows[:12]:
            total += int(size or 0)
            print(f"  {name:<30} {int(size or 0) / (1024 * 1024):8.2f} MB")
        print(f"  {'TOTAL':<30} {total / (1024 * 1024):8.2f} MB")

        for label, sql in (
            ("books", "SELECT COUNT(*) FROM books"),
            ("exams", "SELECT COUNT(*) FROM exams"),
            ("users", "SELECT COUNT(*) FROM users"),
            ("orders", "SELECT COUNT(*) FROM orders"),
            ("stored PDFs (bytes)", "SELECT COALESCE(SUM(size_bytes),0) FROM stored_files"),
            ("uploaded images (bytes)", "SELECT COALESCE(SUM(size_bytes),0) FROM uploaded_images"),
        ):
            try:
                value = db.session.execute(db.text(sql)).scalar()
                if "bytes" in label:
                    print(f"{label:<26} {int(value or 0) / (1024 * 1024):8.2f} MB")
                else:
                    print(f"{label:<26} {int(value or 0)}")
            except Exception as exc:  # noqa: BLE001
                print(f"{label:<26} — ({str(exc)[:60]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
