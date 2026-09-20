"""
A hard spending limit for AI answers. Meta offers no billing cap of its own, so Cue enforces one.

Layers of protection, checked BEFORE every model call:
  1. Total cap (default $25): the whole team's spending, read from a shared ledger in Supabase.
     If that ledger isn't set up, each computer only knows its own spending, so it gets a fair share
     (cap / LLM_BUDGET_MACHINES) rather than the whole cap.
  2. Daily cap (default $5): stops a bug or a busy day from burning the whole budget at once.
  3. Hourly call cap (default 120): stops runaway loops.
The check uses an upper-bound cost for the call about to happen, so spending never crosses the cap.
When the total cap is reached the team is alerted exactly once (see notify.py) and AI answers stop.
"""

import datetime
import json
import os
import threading
import time
from pathlib import Path

try:
    import notify
except ImportError:  # imported as backend.budget
    from . import notify

LEDGER_FILE = Path.home() / ".cue" / "llm_ledger.json"
# About the worst-case cost of one answer. Once less than this is left the guard refuses calls, so the app calls that "reached".
MIN_CALL_COST = 0.012


class BudgetExceeded(Exception):
    """`kind` is 'total', 'daily' or 'hourly'."""

    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind
        self.message = message


def _float_env(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class SharedLedger:
    """The team-wide ledger (llm_usage table). Every method tolerates the table not existing yet."""

    def __init__(self, db, ttl=30):
        self.db, self.ttl = db, ttl
        self._total = (None, 0.0)
        self._alerted = (False, 0.0)

    def total(self, clock=time.time):
        value, at = self._total
        if clock() - at < self.ttl:
            return value
        value, _err = self.db.sum_llm_usage()
        self._total = (value, clock())
        return value

    def add_local_cost(self, cost):
        """Keep the cached total honest between refreshes."""
        value, at = self._total
        if value is not None:
            self._total = (value + cost, at)

    def record(self, row):
        ok, _err = self.db.insert_llm_usage(row)
        return ok

    def alerted(self, clock=time.time):
        value, at = self._alerted
        if value or clock() - at < self.ttl:
            return value
        value = self.db.has_llm_alert()
        self._alerted = (value, clock())
        return value

    def mark_alert(self, cost):
        ok, _err = self.db.insert_llm_usage({"purpose": "budget_alert", "cost_usd": 0, "model": f"limit reached at ${cost:.2f}"})
        if ok:
            self._alerted = (True, time.time())
        return ok


class BudgetGuard:
    def __init__(self, cap_usd=25.0, daily_cap_usd=5.0, hourly_calls=120, machines=2,
                 ledger_path=LEDGER_FILE, shared=None, clock=time.time, send_alert=None):
        self.cap, self.daily_cap, self.hourly_calls = cap_usd, daily_cap_usd, hourly_calls
        self.machines = max(machines, 1)
        self.ledger_path, self.shared, self.clock = Path(ledger_path), shared, clock
        self._send_alert = send_alert or notify.send_alert
        self._lock = threading.Lock()
        self._unsynced = 0.0
        self.last_alert = None
        self.ledger = self._load()

    @classmethod
    def from_env(cls, shared=None):
        return cls(
            cap_usd=_float_env("LLM_BUDGET_USD", 25.0),
            daily_cap_usd=_float_env("LLM_DAILY_USD", 5.0),
            hourly_calls=int(_float_env("LLM_HOURLY_CALLS", 120)),
            machines=int(_float_env("LLM_BUDGET_MACHINES", 2)),
            shared=shared,
        )

    # -- ledger file -----------------------------------------------------------------------------
    def _load(self):
        try:
            data = json.loads(self.ledger_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("spent", 0.0)
                data.setdefault("calls", 0)
                data.setdefault("days", {})
                data.setdefault("recent", [])
                data.setdefault("alert_sent", None)
                return data
        except Exception:
            pass
        return {"spent": 0.0, "calls": 0, "days": {}, "recent": [], "alert_sent": None,
                "started": datetime.datetime.now().isoformat(timespec="seconds")}

    def _save(self):
        try:
            self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
            self.ledger_path.write_text(json.dumps(self.ledger), encoding="utf-8")
        except Exception as e:
            print(f"[Budget] Couldn't save the spend ledger: {e}")

    def _today(self):
        return datetime.date.fromtimestamp(self.clock()).isoformat()

    # -- how much has been spent -----------------------------------------------------------------
    def _effective(self):
        """(total spent, mode, cap that applies to this computer)."""
        local = float(self.ledger["spent"])
        shared_total = self.shared.total(self.clock) if self.shared else None
        if shared_total is not None:
            return max(shared_total + self._unsynced, local), "shared", self.cap
        return local, "local", self.cap / self.machines

    # -- the gate --------------------------------------------------------------------------------
    def authorize(self, estimated_cost):
        """Call before every model request. Raises BudgetExceeded if it must not go ahead."""
        limit_hit = None
        with self._lock:
            total, mode, cap = self._effective()
            now = self.clock()

            recent = [t for t in self.ledger["recent"] if now - t < 3600]
            if len(recent) >= self.hourly_calls:
                raise BudgetExceeded("hourly", f"Too many AI questions in the last hour (limit {self.hourly_calls}). Try again later.")

            day_spent = float(self.ledger["days"].get(self._today(), 0.0))
            if day_spent + estimated_cost > self.daily_cap:
                raise BudgetExceeded("daily", f"Today's AI limit (${self.daily_cap:.2f}) has been reached. It resets tomorrow.")

            if total >= cap or total + estimated_cost > cap:
                limit_hit = (total, cap, mode)
            else:
                recent.append(now)
                self.ledger["recent"] = recent[-self.hourly_calls:]
                self._save()

        if limit_hit:
            self._on_limit(*limit_hit)
            raise BudgetExceeded("total", f"The AI spending limit (${self.cap:.2f}) has been reached, so smart answers are paused.")

    def record(self, purpose, result, user_id=None):
        """Call after every model request with what it actually cost."""
        cost = float(result.cost_usd)
        with self._lock:
            self.ledger["spent"] = round(float(self.ledger["spent"]) + cost, 6)
            self.ledger["calls"] = int(self.ledger["calls"]) + 1
            today = self._today()
            self.ledger["days"][today] = round(float(self.ledger["days"].get(today, 0.0)) + cost, 6)
            self.ledger["days"] = dict(sorted(self.ledger["days"].items())[-14:])
            self._save()
        if self.shared:
            row = {"purpose": purpose, "model": result.model, "prompt_tokens": result.prompt_tokens,
                   "cached_tokens": result.cached_tokens, "completion_tokens": result.completion_tokens,
                   "cost_usd": round(cost, 6)}
            if user_id:
                row["user_id"] = str(user_id)
            if self.shared.record(row):
                self.shared.add_local_cost(cost)
            else:
                self._unsynced += cost  # keep counting it even though the shared ledger missed it
        total, _mode, cap = self._effective()
        if total >= cap:
            self._on_limit(total, cap, _mode)

    # -- reaching the limit ----------------------------------------------------------------------
    def _on_limit(self, total, cap, mode):
        with self._lock:
            if self.ledger["alert_sent"]:
                return
            if self.shared and self.shared.alerted(self.clock):
                self.ledger["alert_sent"] = "by another computer"
                self._save()
                return
            self.ledger["alert_sent"] = datetime.datetime.now().isoformat(timespec="seconds")
            self._save()
        if self.shared:
            self.shared.mark_alert(total)

        subject = f"Cue: the ${self.cap:.0f} AI spending limit has been reached"
        share_note = " (this computer's share, because the shared ledger is not set up)" if mode == "local" else ""
        body = (
            "Cue has stopped using the Meta AI model, because the team's spending reached the limit.\n\n"
            f"  Spent so far : ${total:.2f}\n"
            f"  Limit        : ${cap:.2f}{share_note}\n\n"
            "What still works: Team Brain keeps answering from your team's notes with a basic, no-AI answer.\n"
            "What is paused: the smarter, model-written answers.\n\n"
            "To continue, check your usage in the Meta Model API dashboard, then raise LLM_BUDGET_USD in backend/.env "
            "(or delete ~/.cue/llm_ledger.json and the llm_usage rows if you have topped up).\n"
        )
        self.last_alert = {"at": self.ledger["alert_sent"], **self._send_alert(subject, body)}

    # -- for the app -----------------------------------------------------------------------------
    def status(self):
        with self._lock:
            total, mode, cap = self._effective()
            day_spent = float(self.ledger["days"].get(self._today(), 0.0))
            alert_sent = self.ledger["alert_sent"]
        return {
            "spent_usd": round(total, 4), "cap_usd": round(cap, 2), "percent": round(100 * total / cap, 1) if cap else 100.0,
            "mode": mode, "limit_hit": total + MIN_CALL_COST > cap, "daily_spent_usd": round(day_spent, 4), "daily_cap_usd": self.daily_cap,
            "alert_sent": alert_sent, "email_configured": notify.can_send(), "alert_recipients": notify.recipients(),
            "last_alert": self.last_alert,
        }
