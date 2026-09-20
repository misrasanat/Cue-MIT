"""
Pushes a session's activity to the shared database in the background so teammates see it live.

Nothing here ever runs on the request that the terminal hook is waiting for: events are queued,
then sent in small batches by a worker thread. If the database is unreachable or not set up, the
batch is retried a few times and then dropped, and the reason is kept so the app can show it.
"""

import datetime
import os
import re
import threading

try:
    from project_link import relative_path
except ImportError:  # imported as backend.share_sync
    from .project_link import relative_path

# Files that usually hold secrets are shared as "a sensitive file was edited", never with contents.
SENSITIVE_NAME = re.compile(
    r"(^\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|^id_(rsa|dsa|ecdsa|ed25519)|credential|secret)", re.I
)
SECRET_ASSIGNMENT = re.compile(
    r"(?i)((?:api[_-]?key|secret|token|passw(?:or)?d|authorization|private[_-]?key)\s*[:=]\s*)(\S+)"
)
KEY_SHAPES = re.compile(
    r"\b(AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,})"
)
MAX_SUMMARY = 300


def is_sensitive_file(path):
    return bool(path) and bool(SENSITIVE_NAME.search(os.path.basename(str(path))))


def redact(text):
    """Best-effort masking of obvious credentials before anything leaves the machine."""
    text = SECRET_ASSIGNMENT.sub(r"\1[hidden]", str(text or ""))
    return KEY_SHAPES.sub("[hidden]", text)


def prepare_event(event, root=None):
    """Turns a locally logged event into the row that is safe to share."""
    kind = event.get("kind") or "edit"
    row = {
        "at": event.get("at") or datetime.datetime.now().isoformat(timespec="seconds"),
        "kind": kind,
        "tool": event.get("tool") or "",
    }
    file_path = event.get("file") or ""
    if kind == "command":
        # Command lines can carry tokens and passwords, so only the fact that one ran is shared.
        row.update(file="", summary="Ran a command", diff="")
    elif is_sensitive_file(file_path):
        row.update(file="(sensitive file)", summary="Edited a sensitive file (contents hidden)", diff="")
    else:
        row.update(
            file=relative_path(file_path, root),
            summary=redact(event.get("summary") or "")[:MAX_SUMMARY],
            diff=redact(event.get("diff") or ""),
        )
    return row


class ShareSync:
    def __init__(self, db, interval=2.0, max_attempts=3):
        self.db = db                      # needs upsert_project_session(header) and insert_session_events(rows)
        self.interval = interval
        self.max_attempts = max_attempts
        self._lock = threading.Lock()
        self._headers = {}                # (session id, user id) -> newest header
        self._events = []                 # [(row, attempts)]
        self._thread = None
        self._stop = threading.Event()
        self.state = {"last_ok": None, "error": None, "shared_events": 0}

    def submit(self, header, event_row=None):
        with self._lock:
            self._headers[(header["id"], header["user_id"])] = header
            if event_row is not None:
                self._events.append((event_row, 0))
            if self._thread is None:
                self._thread = threading.Thread(target=self._loop, name="cue-share-sync", daemon=True)
                self._thread.start()

    def queued(self):
        with self._lock:
            return len(self._events)

    def status(self):
        return {**self.state, "queued": self.queued()}

    def _loop(self):
        while not self._stop.wait(self.interval):
            self.flush()

    def flush(self):
        with self._lock:
            headers, self._headers = list(self._headers.values()), {}
            events, self._events = self._events, []
        if not headers and not events:
            return

        error = None
        for header in headers:
            ok, err = self.db.upsert_project_session(header)
            if not ok:
                error = err
                break

        sent = 0
        if error is None and events:
            ok, err = self.db.insert_session_events([row for row, _ in events])
            if ok:
                sent = len(events)
            else:
                error = err

        if error is None:
            self.state.update(last_ok=datetime.datetime.now().isoformat(timespec="seconds"), error=None)
            self.state["shared_events"] += sent
            return

        self.state["error"] = error
        print(f"[Share] Could not sync to the team database: {error}")
        with self._lock:
            for header in headers:
                self._headers.setdefault((header["id"], header["user_id"]), header)
            # Keep the events for another try, but not forever.
            self._events = [(row, n + 1) for row, n in events if n + 1 < self.max_attempts] + self._events
