"""
Settings and guards for running the backend on the public internet (for example on Render).

On a developer's own computer the backend trusts everything that reaches it, which is fine because only that
computer can. On a public server that is not safe, so "public mode" switches off the routes that only make
sense locally (capturing hook events, wiping data, changing the AI key, raw logs), stops trusting identities
that arrive in a request body, limits how fast one visitor can ask questions, and narrows CORS.

Public mode turns on with CUE_PUBLIC_MODE=1, and automatically on Render (which sets RENDER=true), so
forgetting the variable can never leave the dangerous routes open.
"""

import os
import threading
import time
from collections import defaultdict, deque


def is_public():
    return os.environ.get("CUE_PUBLIC_MODE", "").strip() == "1" or os.environ.get("RENDER", "").strip().lower() == "true"


def public_app_url():
    """Where the web app lives, used to build invite links. Defaults to the local dev server."""
    return (os.environ.get("PUBLIC_APP_URL") or "http://localhost:5173").strip().rstrip("/")


def cors_origins():
    """Which websites may call this backend. Everything locally, only the web app on a public server."""
    if not is_public():
        return "*"
    listed = [o.strip().rstrip("/") for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if listed:
        return listed
    app_url = os.environ.get("PUBLIC_APP_URL", "").strip().rstrip("/")
    return [app_url] if app_url else "*"


class RateLimiter:
    """At most `limit` hits per `window` seconds for each key (for example one visitor's address)."""

    def __init__(self, limit, window, clock=time.time):
        self.limit, self.window, self.clock = limit, window, clock
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key):
        now = self.clock()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True
