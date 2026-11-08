"""WSGI entry — MUST stay cheap to import.

Render scans for an open port within ~5 minutes. If we call create_app()
at import time, file-bank parse + Neon schema blocks gunicorn BEFORE it
binds → "No open ports" / deploy timeout.

`app` is a lazy WSGI wrapper: import is instant, bind happens immediately,
Flask boots on the first request (or when a worker warms up).
"""

from __future__ import annotations

import logging
import os
import threading

logger = logging.getLogger("cronyzo.wsgi")

# Two Render health-check probes can land at the same instant; without this
# lock both threads would build the app and the second one would try to
# register blueprints *after* the first request had already been served
# ("register_blueprint can no longer be called…").
_boot_lock = threading.Lock()


def _debug_panel_enabled() -> bool:
    """Off unless asked for. A live shop must not publish /debug to the world."""
    flag = os.getenv("DEBUG_PANEL", "").strip().lower()
    return flag in ("1", "true", "yes", "on")


class LazyFlaskApp:
    """WSGI callable that builds the real Flask app on first use."""

    def __init__(self) -> None:
        self._app = None

    def _load(self):
        if self._app is not None:
            return self._app
        with _boot_lock:
            if self._app is not None:      # another thread won the race
                return self._app
            logger.warning("Bootstrapping Flask app (first load)…")
            from app import create_app

            app = create_app()
            # Everything that mutates the app happens HERE, before the instance
            # is published, so no request can ever race a blueprint registration.
            if _debug_panel_enabled():
                try:
                    from debug_panel import debug_bp, install_debug_handlers

                    app.register_blueprint(debug_bp)
                    install_debug_handlers(app)
                except ModuleNotFoundError:
                    pass
                except Exception:
                    logger.exception("debug panel skipped")
            else:
                logger.info("debug panel disabled (set DEBUG_PANEL=1 to enable)")
            self._app = app
            logger.warning("Flask app ready")
        return self._app

    def __call__(self, environ, start_response):
        return self._load()(environ, start_response)

    def __getattr__(self, name):
        # gunicorn / flask-migrate sometimes poke attributes
        return getattr(self._load(), name)


app = LazyFlaskApp()
