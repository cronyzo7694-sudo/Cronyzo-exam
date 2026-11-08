"""Serve the built web app from the API host.

Why this exists
---------------
The public site normally lives on Cloudflare Workers (static assets, free,
never cold). But a deploy token is not always at hand, and "the change is in
the repo but the site still shows yesterday's page" is never acceptable — so
the same build is also served by Flask itself.

``scripts/publish_site.sh`` copies ``frontend/dist`` into
``backend/static_site`` and commits it. Render's existing build then publishes
the new UI with no dashboard work at all: same origin as the API, so there is
not even a CORS preflight to pay for.

Rules
-----
* Concrete API routes always win — this blueprint is registered last and only
  claims URLs nobody else matched.
* ``/api/…`` and ``/files/…`` are never answered with HTML: an unknown API path
  must stay an honest 404, not a single-page-app fallback.
* ``/assets/*`` (fingerprinted by Vite) get a one-year immutable cache;
  ``index.html`` is ``no-cache`` so a new deploy is visible immediately.
"""

from __future__ import annotations

import logging
from pathlib import Path

from flask import Blueprint, jsonify, send_from_directory

logger = logging.getLogger("cronyzo.spa")

spa_bp = Blueprint("spa", __name__)

# backend/app/routes/spa.py → backend/static_site
SITE_ROOT = Path(__file__).resolve().parents[2] / "static_site"

_RESERVED_PREFIXES = ("api/", "files/", "images/")


def _site_root() -> Path:
    return SITE_ROOT


def _send(path: str, cache: str):
    resp = send_from_directory(_site_root(), path)
    resp.headers["Cache-Control"] = cache
    return resp


@spa_bp.get("/")
def index():
    root = _site_root()
    if not (root / "index.html").is_file():
        return (
            jsonify(
                {
                    "service": "Cronyzo",
                    "status": "ok",
                    "message": "API is running. The web build is not published on this host — "
                    "run scripts/publish_site.sh (or use the Cloudflare Worker URL).",
                }
            ),
            200,
        )
    return _send("index.html", "no-cache")


@spa_bp.get("/<path:filename>")
def static_or_spa(filename: str):
    root = _site_root()

    if filename.startswith(_RESERVED_PREFIXES):
        return jsonify({"error": "Not found"}), 404

    candidate = (root / filename).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        # Path traversal attempt — pretend it does not exist.
        return jsonify({"error": "Not found"}), 404

    if candidate.is_file():
        cache = (
            "public, max-age=31536000, immutable"
            if filename.startswith("assets/")
            else "public, max-age=3600"
        )
        return _send(filename, cache)

    # Everything that is not a file is a client-side route: hand back the shell.
    if (root / "index.html").is_file():
        return _send("index.html", "no-cache")
    return jsonify({"error": "Not found"}), 404
