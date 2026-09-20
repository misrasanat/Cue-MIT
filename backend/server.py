"""
Cue Backend Server
==================
Flask-based backend service for Cue that captures Gemini CLI lifecycle hooks and code changes.

Key Responsibilities:
- Receives telemetry from Gemini CLI hooks and the Antigravity transcript watcher (/capture)
  and records edits, commands and stated intents into per-session logs (/sessions).
- Never calls a model in the background: Cue Cards are generated on demand when the user
  asks for a session (POST /sessions/<id>/generate), one Gemini call per changed file.
- Stores cards in Supabase for signed-in users, or falls back to in-memory state.
- Exposes REST APIs for client configuration, card retrieval, standup summary generation, and debugging.
"""

import os
import re
import uuid
import json
import hashlib
import threading
import datetime
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from hook_installer import install_global_hook
from watcher import TranscriptWatcher
from supabase_client import (
    get_user_id_from_token,
    get_user_info_from_token,
    save_cue_card,
    get_user_cue_cards,
    get_project_cue_cards,
    create_organization,
    get_organization,
    create_project,
    get_project,
    get_user_projects,
    add_project_member,
    get_project_members,
    create_invite,
    get_invite,
    accept_invite,
    register_user_email,
    get_project_member_emails,
    friendly_name,
    upsert_project_session,
    insert_session_events,
    list_project_sessions,
    list_recent_session_events,
    get_session_events,
    get_session_carded,
    add_session_carded,
    newest_session_events,
    session_events_after,
)
import supabase_client
from project_link import find_link
from share_sync import ShareSync, prepare_event
from llm import MetaClient
from budget import BudgetGuard, SharedLedger
from team_qa import TeamQA
from seed_data import SAM_CUE_CARDS

# Load environment variables from .env if present
load_dotenv(override=True)

app = Flask(__name__)
CORS(app)  # Enables cross-origin requests from the web app frontend

# Auto-register global Gemini CLI hook in ~/.gemini/settings.json
hook_success, hook_info = install_global_hook()

api_key = os.environ.get("GEMINI_API_KEY", "").strip()

def get_genai_client(custom_key=None):
    key = custom_key or api_key or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key or key == "YOUR_GEMINI_API_KEY_HERE":
        return None
    try:
        from google import genai
        return genai.Client(api_key=key)
    except Exception as e:
        print(f"[Warning] Failed to instantiate GenAI client: {e}")
        return None

client = get_genai_client(api_key)

# In-memory fallback state
cards = []
EDIT_TOOLS = {
    "write_file", "replace",  # Gemini CLI
    "write_to_file", "replace_file_content", "multi_replace_file_content",  # Antigravity CLI
}
COMMAND_TOOLS = {"run_command"}
telemetry_logs = []  # rolling buffer of last 50 raw hook events for the debug stream

CARD_SYSTEM_INSTRUCTION = """You are a warm, encouraging senior engineering mentor explaining AI code changes to an engineering intern.
Your goal is to bridge "comprehension lag" and teach them the architectural intuition behind the code diff and stated intent.

Avoid dry academic jargon. Explain concepts using intuitive mental models, practical engineering trade-offs, and plain language that helps an intern learn and confidently explain the code during standup.

If the change is trivial (e.g., formatting, fixing a typo, updating single comment), return:
{"skip": true}

Otherwise, generate a JSON object matching this schema:
{
  "decision": "One clear sentence explaining the architectural choice made in plain, accessible terms (no buzzword salad)",
  "why": "Friendly explanation of why this was done. Use a short analogy or intuitive comparison (e.g., 'Think of this like...') to make the concept stick.",
  "mentor_tip": "One punchy, practical piece of advice or key concept an intern should remember about this pattern",
  "alternatives": [
    {
      "option": "Alternative approach (with brief 3-5 word plain English descriptor)",
      "pros": ["Clear advantage in plain language", "Another benefit"],
      "cons": ["Practical downside or risk", "Another downside"]
    }
  ],
  "category": "architecture | data-structure | api-design | security | performance",
  "quiz": {
    "question": "An intuitive comprehension question checking if the intern understands the main tradeoff or concept (avoid trick questions)",
    "options": ["Option A", "Option B", "Option C"],
    "correct_index": 0
  }
}
"""

ASK_TEAM_SYSTEM_INSTRUCTION = """You are Cue, a friendly AI mentor helping a novice/intern developer understand their teammate's codebase.
The user is a beginner and needs minimal, clear, plain-English explanations without confusing technical jargon.

RULES:
1. Explain technical concepts simply using plain English. If mentioning a technical concept (like jitter or circuit breaker), explain what it actually does in 1 easy sentence.
2. Include a simple real-world analogy or everyday comparison (e.g. 'Think of this like...').
3. Attribute directly to the teammate (e.g. 'Sam set this up because...').
4. Keep the total answer to 2-3 short, friendly sentences.
5. Ground strictly in the provided cards.
"""

# ---------------------------------------------------------------------------
# Session log store
# /capture only records events here. Cards are generated on demand
# (POST /sessions/<id>/generate) so the Gemini API is never called in the background.
# ---------------------------------------------------------------------------
MAX_DIFF_CHARS = 4000          # cap on diff text stored / sent to the model
MAX_EVENTS_PER_SESSION = 200
MAX_SESSIONS = 50
MAX_FILES_PER_GENERATE = 10    # hard cap on model calls per click
MIN_CHANGED_LINES = 3          # smaller edits are treated as trivial and skipped
SKIP_FILE_NAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "uv.lock", "cargo.lock", "pipfile.lock",
}
SKIP_EXTENSIONS = {".md", ".txt", ".lock", ".log", ".svg", ".png", ".jpg"}
SESSIONS_FILE = Path.home() / ".cue" / "sessions.json"

sessions_lock = threading.Lock()


def _load_sessions():
    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_sessions():
    """Persist the session log so it survives server restarts. Caller holds the lock."""
    try:
        SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(sessions, f)
    except Exception as e:
        print(f"[Sessions] Failed to persist session log: {e}")


sessions = _load_sessions()

# Pushes activity from linked repos to the team database in the background (see share_sync.py).
share = ShareSync(supabase_client)

# Team Brain's question answering (see team_qa.py). The model client reads META_API_KEY from backend/.env,
# and every model call passes through the spending limit in budget.py.
llm_client = MetaClient()
budget_guard = BudgetGuard.from_env(shared=SharedLedger(supabase_client))
team_qa = TeamQA(llm_client, budget_guard)


def _extract_diff(tool_input, tool_response):
    """Best available diff/content for an edit, capped so it stays cheap to store and send."""
    display = tool_response.get("returnDisplay")
    diff = display.get("fileDiff", "") if isinstance(display, dict) else ""
    diff = (diff or tool_input.get("diff", "") or tool_input.get("content", "")
            or tool_input.get("new_string", ""))
    return str(diff)[:MAX_DIFF_CHARS]


def _session_for(session_id, source):
    now = datetime.datetime.now().isoformat(timespec="seconds")
    return sessions.setdefault(session_id, {
        "id": session_id, "source": source, "started": now,
        "last_activity": now, "events": [], "last_intent": "", "carded": [],
    })


def record_session_event(session_id, event, tool_name, tool_input, tool_response, project_id=None, user_id=None):
    """Append an edit/command/intent event to its session log (no AI call), and share it with the team if the repo is linked."""
    now = datetime.datetime.now()
    now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    to_share = None
    with sessions_lock:
        s = _session_for(session_id, event.get("source", "gemini_cli"))
        s["last_activity"] = now.isoformat(timespec="seconds")

        # A repo is only shared once it has been linked with `cue link`. The link is found from the
        # edited file (which works for Antigravity too), or from the hook's own working folder.
        link = find_link(tool_input.get("file_path")) if tool_name in EDIT_TOOLS else None
        effective_project = (link or {}).get("project_id") or project_id
        if effective_project:
            s["project_id"] = effective_project

        new_event = None
        if tool_name == "update_topic":
            s["last_intent"] = tool_input.get("summary", "") or tool_input.get("strategic_intent", "")
        elif tool_name in EDIT_TOOLS:
            new_event = {
                "ts": now.strftime("%H:%M:%S"),
                "at": now_utc,
                "kind": "edit",
                "tool": tool_name,
                "file": tool_input.get("file_path", ""),
                "summary": tool_input.get("summary") or s["last_intent"],
                "diff": _extract_diff(tool_input, tool_response),
            }
        else:
            new_event = {
                "ts": now.strftime("%H:%M:%S"),
                "at": now_utc,
                "kind": "command",
                "tool": tool_name,
                "file": "",
                "summary": str(tool_input.get("summary", ""))[:200],
                "diff": "",
            }
        if new_event:
            s["events"].append(new_event)

        # Which events go to the team: edits inside the linked repo, and the commands and intent
        # of a session that has already started sharing. Edits elsewhere stay on this machine.
        if user_id:
            sharing = s.get("share")
            if tool_name in EDIT_TOOLS and effective_project and not sharing:
                sharing = s["share"] = {"project_id": effective_project, "edits": 0, "commands": 0,
                                        "root": (link or {}).get("root", "")}
            if sharing and (tool_name == "update_topic" or new_event is not None):
                event_belongs = tool_name != "update_topic" and (
                    tool_name not in EDIT_TOOLS or effective_project == sharing["project_id"])
                if new_event is not None and event_belongs:
                    sharing["edits" if new_event["kind"] == "edit" else "commands"] += 1
                header = {
                    "id": session_id, "user_id": user_id, "project_id": sharing["project_id"],
                    "source": s.get("source", "gemini_cli"), "started_at": s.setdefault("started_utc", now_utc),
                    "last_activity": now_utc, "last_intent": s.get("last_intent", "")[:500],
                    "edit_count": sharing["edits"], "command_count": sharing["commands"],
                }
                row = None
                if new_event is not None and event_belongs:
                    row = prepare_event(new_event, sharing.get("root"))
                    row.update(session_id=session_id, user_id=user_id, project_id=sharing["project_id"])
                to_share = (header, row)

        del s["events"][:-MAX_EVENTS_PER_SESSION]
        if len(sessions) > MAX_SESSIONS:
            oldest = sorted(sessions, key=lambda k: sessions[k].get("last_activity", ""))
            for k in oldest[:len(sessions) - MAX_SESSIONS]:
                del sessions[k]
        _save_sessions()

    if to_share:
        share.submit(*to_share)


def _changed_lines(diff):
    lines = [l for l in diff.splitlines() if l.strip()]
    marked = [l for l in lines if l.startswith(("+", "-")) and not l.startswith(("+++", "---"))]
    return len(marked) if marked else len(lines)


def _is_trivial(file_path, diff):
    name = os.path.basename(file_path or "").lower()
    return (name in SKIP_FILE_NAMES
            or os.path.splitext(name)[1] in SKIP_EXTENSIONS
            or _changed_lines(diff) < MIN_CHANGED_LINES)


def _fallback_card(file_path, intent_text, timestamp):
    return {
        "id": str(uuid.uuid4()),
        "file": file_path,
        "timestamp": timestamp,
        "decision": f"Modified {file_path} based on task intent",
        "why": intent_text or "Updated code implementation",
        "mentor_tip": "Keep modules modular and focused so each part of your code does one job well.",
        "alternatives": [
            {"option": "Monolithic implementation",
             "pros": ["Faster single-file setup"],
             "cons": ["Harder to maintain and test"]},
            {"option": "Decoupled module architecture",
             "pros": ["Separation of concerns", "Independent testability"],
             "cons": ["Slightly more boilerplate setup"]},
        ],
        "category": "architecture",
        "quiz": {
            "question": f"Why was {file_path} split or updated in this step?",
            "options": [
                "To maintain clean separation of concerns and component decoupling",
                "To reduce total number of files in the project",
                "Because the AI agent required it",
            ],
            "correct_index": 0,
        },
        "generator": "fallback-mock",
    }


def build_card(file_path, intent_text, diff, timestamp):
    """One model call for one file. Returns a card dict, or None if the model judged it trivial."""
    if not client:
        return _fallback_card(file_path, intent_text, timestamp)

    prompt = f"""
File touched: {file_path}
Stated Intent: {json.dumps({"summary": intent_text})}
Diff / Changes:
{diff}
"""
    try:
        from google.genai import types
        model_name = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=CARD_SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                max_output_tokens=1200,
            ),
        )
        card = json.loads(response.text)
        if card.get("skip"):
            return None
        card.update(id=str(uuid.uuid4()), file=file_path, timestamp=timestamp,
                    generator="real-gemini-ai")
        return card
    except Exception as e:
        print(f"[Generate] Gemini failed for {file_path} ({e}); using fallback card.")
        return _fallback_card(file_path, intent_text, timestamp)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "api_key_configured": bool(api_key),
        "hook_installed": hook_success,
        "hook_info": hook_info,
        "card_count": len(cards)
    })

@app.route("/config", methods=["GET", "POST"])
def config():
    global api_key, client
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        new_key = data.get("api_key", "").strip()
        if new_key:
            api_key = new_key
            client = get_genai_client(api_key)
            return jsonify({"status": "updated", "api_key_configured": True, "hook_installed": hook_success})
        else:
            api_key = ""
            client = None
            return jsonify({"status": "cleared", "api_key_configured": False, "hook_installed": hook_success})

    # GET method
    masked = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else ("Configured" if api_key else "Not Set")
    return jsonify({
        "api_key_configured": bool(api_key),
        "hook_installed": hook_success,
        "hook_info": hook_info,
        "masked_key": masked
    })

@app.route("/capture", methods=["POST"])
def capture():
    event = request.get_json(silent=True)
    if not event:
        return jsonify({"status": "empty_payload"}), 400

    auth_header = request.headers.get("Authorization")
    user_id = get_user_id_from_token(auth_header)

    session_id = event.get("session_id", "default_session")
    tool_name = event.get("tool_name", "unknown")
    tool_input = event.get("tool_input", {})
    tool_response = event.get("tool_response", {})

    project_id = event.get("project_id") or request.headers.get("X-Project-Id")

    # Record telemetry log for live debugging stream
    log_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        "tool_name": tool_name,
        "session_id": session_id[:8],
        "user_id": user_id or "local_dev",
        "project_id": project_id,
        "file_path": tool_input.get("file_path", ""),
        "summary": tool_input.get("summary") or tool_input.get("file_path") or f"Tool: {tool_name}",
        "raw_event": event
    }
    telemetry_logs.insert(0, log_entry)
    if len(telemetry_logs) > 50:
        telemetry_logs.pop()

    # Log only. Cards are generated on demand via POST /sessions/<id>/generate,
    # so no model call ever happens in the background here.
    if tool_name == "update_topic" or tool_name in EDIT_TOOLS or tool_name in COMMAND_TOOLS:
        record_session_event(session_id, event, tool_name, tool_input, tool_response,
                             project_id=project_id, user_id=user_id)
        return jsonify({"status": "logged", "session_id": session_id})

    return jsonify({"status": "ignored", "tool_name": tool_name})


@app.route("/sessions", methods=["GET"])
def list_sessions():
    """Session summaries (newest first) for the dashboard. Diffs are left out to keep this light."""
    out = []
    with sessions_lock:
        for s in sessions.values():
            edits = [e for e in s["events"] if e["kind"] == "edit"]
            files = list(dict.fromkeys(e["file"] for e in edits if e["file"]))
            out.append({
                "id": s["id"],
                "source": s.get("source", ""),
                "started": s.get("started", ""),
                "last_activity": s.get("last_activity", ""),
                "edit_count": len(edits),
                "command_count": len(s["events"]) - len(edits),
                "files": files,
                "cards_generated": len(s.get("carded", [])),
                "events": [{k: e[k] for k in ("ts", "kind", "tool", "file", "summary")}
                           for e in s["events"]],
            })
    out.sort(key=lambda x: x["last_activity"], reverse=True)
    return jsonify(out)


def _group_edits_by_file(edits):
    by_file = {}
    for e in edits:
        if e.get("file"):
            by_file.setdefault(e["file"], []).append(e)
    return by_file


def _make_cards(by_file, already, mocked, project_id, owner_id, allow_mock=True, keep_local=True):
    """
    One model call per changed file. Shared by a user's own sessions and by teammates' shared sessions.
    `owner_id` is whose work the lessons are about, and where they are saved. `keep_local` also keeps
    them in this server's memory, which only makes sense for the user's own sessions.
    """
    created, skipped, done_before, deferred = [], 0, 0, 0
    shared, share_error = 0, None  # how many cards actually reached the shared database
    newly_carded, newly_mocked = [], []
    for file_path, group in by_file.items():
        diff = "\n...\n".join(e["diff"] for e in group if e["diff"])[:MAX_DIFF_CHARS]
        intents = list(dict.fromkeys(e["summary"] for e in group if e["summary"]))[:5]
        intent_text = "; ".join(intents) or "Direct file edit"
        digest = hashlib.sha1(f"{file_path}\n{diff}\n{intent_text}".encode("utf-8")).hexdigest()

        if digest in already or (not client and digest in mocked):
            done_before += 1
            continue
        if _is_trivial(file_path, diff):
            skipped += 1
            continue
        if len(created) >= MAX_FILES_PER_GENERATE:
            deferred += 1
            continue

        card = build_card(file_path, intent_text, diff, group[-1]["ts"])
        if card is not None and card.get("generator") == "fallback-mock":
            if not allow_mock:
                skipped += 1  # placeholder cards must never enter the team's knowledge
                continue
            newly_mocked.append(digest)
        else:
            newly_carded.append(digest)
        if card is None:
            skipped += 1
            continue
        if project_id:
            card["project_id"] = project_id
        if keep_local:
            cards.append(card)
        if owner_id:
            outcome = save_cue_card(owner_id, card, project_id=project_id)
            if outcome["shared"]:
                shared += 1
            elif share_error is None:
                share_error = outcome["error"]
        created.append(card)

    return {
        "created": created, "skipped": skipped, "done_before": done_before, "deferred": deferred,
        "shared": shared, "share_error": share_error,
        "newly_carded": newly_carded, "newly_mocked": newly_mocked,
    }


def _generate_response(result, has_owner):
    return jsonify({
        "status": "ok",
        "created": len(result["created"]),
        "skipped_trivial": result["skipped"],
        "already_generated": result["done_before"],
        "deferred": result["deferred"],  # click again to process the rest
        "cards": result["created"],
        # `shared` is how many lessons reached the team database; a signed-in user expects all of them.
        "shared": result["shared"],
        "share_error": result["share_error"],
        "share_expected": has_owner,
    })


@app.route("/sessions/<session_id>/generate", methods=["POST"])
def generate_session_cards(session_id):
    """Turn a session's logged edits into Cue Cards. One model call per changed file."""
    user_id = get_user_id_from_token(request.headers.get("Authorization"))

    with sessions_lock:
        s = sessions.get(session_id)
        if not s:
            return jsonify({"status": "not_found"}), 404
        edits = [dict(e) for e in s["events"] if e["kind"] == "edit"]
        already = set(s.get("carded", []))
        mocked = set(s.get("mocked", []))  # template cards made without an API key
        shared_project = (s.get("share") or {}).get("project_id")
        project_id = s.get("project_id") or request.headers.get("X-Project-Id")

    # A teammate may already have made lessons from this shared session; don't pay for them twice.
    if shared_project and user_id:
        already |= set(get_session_carded(shared_project, user_id, session_id))

    result = _make_cards(_group_edits_by_file(edits), already, mocked, project_id, user_id)

    if result["newly_carded"] or result["newly_mocked"]:
        with sessions_lock:
            sessions[session_id].setdefault("carded", []).extend(result["newly_carded"])
            sessions[session_id].setdefault("mocked", []).extend(result["newly_mocked"])
            _save_sessions()
    if shared_project and user_id and result["newly_carded"]:
        add_session_carded(shared_project, user_id, session_id, result["newly_carded"])

    return _generate_response(result, bool(user_id))


# ==============================================================================
# Teammates' live sessions (see schema_sessions.sql, share_sync.py)
# ==============================================================================

def _share_hint(err):
    text = str(err or "")
    if any(marker in text for marker in ("PGRST205", "42P01", "does not exist", "schema cache")):
        return ("Live sharing isn't set up in your team's database yet. "
                "Run backend/schema_sessions.sql in the Supabase SQL editor.")
    return "Couldn't reach your team's live sessions: " + text[:160]


@app.route("/share/status", methods=["GET"])
def share_status():
    """How live sharing from this computer is going, for the Settings screen."""
    state = share.status()
    with sessions_lock:
        linked = sum(1 for s in sessions.values() if s.get("share"))
    return jsonify({**state, "linked_sessions": linked, "hint": _share_hint(state["error"]) if state["error"] else None})


@app.route("/projects/<project_id>/sessions", methods=["GET"])
def api_project_sessions(project_id):
    """Recent coding sessions from everyone on the project, newest first. Diffs are left out to keep it light."""
    rows, err = list_project_sessions(project_id)
    if err:
        return jsonify({"sessions": [], "ready": False, "error": _share_hint(err)})
    events, _ = list_recent_session_events(project_id)

    grouped = {}
    for e in events:  # newest first
        grouped.setdefault((e["session_id"], str(e["user_id"])), []).append(e)

    emails = get_project_member_emails(project_id)
    out = []
    for r in rows:
        uid = str(r["user_id"])
        evs = grouped.get((r["id"], uid), [])
        email = emails.get(uid, "")
        out.append({
            "id": r["id"], "user_id": uid,
            "author": friendly_name(email), "author_email": email,
            "source": r.get("source", ""), "started_at": r.get("started_at"),
            "last_activity": r.get("last_activity"), "last_intent": r.get("last_intent", ""),
            "edit_count": r.get("edit_count", 0), "command_count": r.get("command_count", 0),
            "cards_generated": len(r.get("carded") or []),
            "files": list(dict.fromkeys(e["file"] for e in evs if e.get("kind") == "edit" and e.get("file"))),
            "events": [{k: e.get(k) for k in ("at", "kind", "file", "summary")} for e in reversed(evs[:12])],
        })
    return jsonify({"sessions": out, "ready": True, "error": None})


@app.route("/projects/<project_id>/sessions/<owner_id>/<session_id>/generate", methods=["POST"])
def api_generate_shared_session(project_id, owner_id, session_id):
    """Make lessons from a teammate's shared session, using the viewer's AI key. The lessons belong to the teammate."""
    viewer_id = get_user_id_from_token(request.headers.get("Authorization"))
    if not viewer_id:
        return jsonify({"error": "Sign in to make lessons from your team's sessions."}), 401
    if viewer_id not in get_project_member_emails(project_id):
        return jsonify({"error": "Only members of this project can do that."}), 403
    if not client:
        return jsonify({"error": "needs_ai_key",
                        "message": "Making lessons from a teammate's session needs an AI key. Add one in Settings."}), 400

    events, err = get_session_events(project_id, owner_id, session_id)
    if err:
        return jsonify({"error": _share_hint(err)}), 502
    edits = [{"file": e["file"], "diff": e.get("diff") or "", "summary": e.get("summary") or "", "ts": str(e.get("at"))}
             for e in events if e.get("kind") == "edit" and e.get("file") and e["file"] != "(sensitive file)"]

    already = set(get_session_carded(project_id, owner_id, session_id))
    result = _make_cards(_group_edits_by_file(edits), already, set(), project_id, owner_id,
                         allow_mock=False, keep_local=False)
    if result["newly_carded"]:
        add_session_carded(project_id, owner_id, session_id, result["newly_carded"])
    return _generate_response(result, True)


@app.route("/cards", methods=["GET"])
def get_cards():
    project_id = request.args.get("project_id")
    if project_id:
        db_cards = get_project_cue_cards(project_id)
        if db_cards:
            formatted_cards = []
            for item in db_cards:
                formatted_cards.append({
                    "id": str(item.get("id")),
                    "project_id": item.get("project_id"),
                    "user_id": item.get("user_id"),
                    "author": item.get("author_name") or "Teammate",
                    "author_email": item.get("author_email") or "",
                    "file": item.get("file_path"),
                    "decision": item.get("decision"),
                    "why": item.get("why"),
                    "category": item.get("category"),
                    "alternatives": item.get("alternatives", []),
                    "quiz": item.get("quiz", {}),
                    "timestamp": item.get("created_at")
                })
            return jsonify(formatted_cards)
        matching_in_mem = [c for c in cards if c.get("project_id") == project_id]
        if matching_in_mem:
            return jsonify(matching_in_mem)

    auth_header = request.headers.get("Authorization")
    user_id = get_user_id_from_token(auth_header)
    if user_id:
        db_cards = get_user_cue_cards(user_id)
        if db_cards:
            # Map database schema to frontend card schema
            formatted_cards = []
            for item in db_cards:
                formatted_cards.append({
                    "id": str(item.get("id")),
                    "project_id": item.get("project_id"),
                    "file": item.get("file_path"),
                    "decision": item.get("decision"),
                    "why": item.get("why"),
                    "category": item.get("category"),
                    "alternatives": item.get("alternatives", []),
                    "quiz": item.get("quiz", {}),
                    "timestamp": item.get("created_at")
                })
            return jsonify(formatted_cards)

    return jsonify(cards)


# ==============================================================================
# Organizations, Projects, and Team Invites Endpoints
# ==============================================================================

@app.route("/organizations", methods=["POST"])
def api_create_organization():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Organization name is required"}), 400

    auth_header = request.headers.get("Authorization")
    user_id, _ = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "Unauthorized. Please log in first."}), 401

    org = create_organization(name, user_id)
    if not org:
        return jsonify({"error": "Failed to create organization"}), 500
    return jsonify(org), 201


@app.route("/organizations/<org_id>/projects", methods=["POST"])
def api_create_project(org_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Project name is required"}), 400

    auth_header = request.headers.get("Authorization")
    user_id, token_email = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = data.get("user_id")
    creator_email = token_email or data.get("email") or data.get("user_email")
    if user_id and creator_email:
        register_user_email(user_id, creator_email)

    if not user_id:
        return jsonify({"error": "Unauthorized. Please log in first."}), 401

    project = create_project(org_id, name, user_id)
    if not project:
        return jsonify({"error": "Failed to create project"}), 500
    return jsonify(project), 201


@app.route("/projects/<project_id>/invite", methods=["POST"])
def api_create_project_invite(project_id):
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Invited email is required"}), 400

    auth_header = request.headers.get("Authorization")
    user_id, token_email = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = data.get("user_id")
    inviter_email = token_email or data.get("inviter_email")
    if user_id and inviter_email:
        register_user_email(user_id, inviter_email)

    if not user_id:
        return jsonify({"error": "Unauthorized. Please log in first."}), 401

    invite = create_invite(project_id, email, user_id)
    if not invite:
        return jsonify({"error": "Failed to create invite"}), 500

    token = invite["id"]
    invite_url = f"http://localhost:5173/join?token={token}"
    print(f"[Email Service Mock] Sending invite email to '{email}' for project '{project_id}'. Link: {invite_url}")

    return jsonify({
        "invite": invite,
        "token": token,
        "invite_url": invite_url
    }), 201


@app.route("/invites/<token>/accept", methods=["POST"])
def api_accept_invite(token):
    auth_header = request.headers.get("Authorization")
    user_id, token_email = get_user_info_from_token(auth_header)
    data = request.get_json(silent=True) or {}
    if not user_id:
        user_id = data.get("user_id")
    acceptor_email = token_email or data.get("email")
    if user_id and acceptor_email:
        register_user_email(user_id, acceptor_email)

    if not user_id:
        return jsonify({"error": "Unauthorized. Please log in first."}), 401

    result, err = accept_invite(token, user_id)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(result), 200


@app.route("/user/projects", methods=["GET"])
def api_get_user_projects():
    auth_header = request.headers.get("Authorization")
    user_id, token_email = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = request.args.get("user_id")
    req_email = token_email or request.args.get("email")
    if user_id and req_email:
        register_user_email(user_id, req_email)

    if not user_id:
        return jsonify([]), 200

    projects = get_user_projects(user_id)
    return jsonify(projects), 200


@app.route("/projects/<project_id>/members", methods=["GET"])
def api_get_project_members(project_id):
    members = get_project_members(project_id)
    return jsonify(members), 200


@app.route("/invites/<token>", methods=["GET"])
def api_get_invite_details(token):
    inv = get_invite(token)
    if not inv:
        return jsonify({"error": "Invite not found"}), 404
    proj = get_project(inv["project_id"])
    return jsonify({
        "invite": inv,
        "project": proj
    }), 200

@app.route("/reset", methods=["POST"])
def reset():
    cards.clear()
    with sessions_lock:
        sessions.clear()
        _save_sessions()
    telemetry_logs.clear()
    return jsonify({"status": "cleared"})

@app.route("/logs", methods=["GET"])
def get_logs():
    """Returns the rolling buffer of raw hook events for the live debug stream."""
    return jsonify(telemetry_logs)

@app.route("/standup", methods=["GET"])
def standup():
    auth_header = request.headers.get("Authorization")
    user_id = get_user_id_from_token(auth_header)
    card_list = cards
    if user_id:
        db_cards = get_user_cue_cards(user_id)
        if db_cards:
            card_list = db_cards

    if not card_list:
        return jsonify({
            "bullets": [
                "Worked on setting up baseline project architecture.",
                "Integrated Gemini CLI lifecycle event hooks.",
                "Prepped workspace for real-time decision tracking."
            ]
        })
    
    bullets = []
    for c in card_list[-3:]:
        decision = c.get('decision') or c.get('file_path') or 'Updated codebase'
        why = c.get('why', '')
        bullets.append(f"• {decision} — {why}")
    
    return jsonify({"bullets": bullets})

def get_all_collective_cards(project_id=None):
    """Returns all cue cards in the team pool, scoped to project_id or Sam's seeded profile."""
    pool = []

    # 1. Real project cards from Supabase if project_id is provided
    if project_id:
        db_project_cards = get_project_cue_cards(project_id)
        for c in db_project_cards:
            pool.append({
                "id": str(c.get("id")),
                "project_id": c.get("project_id"),
                "user_id": c.get("user_id"),
                "file": c.get("file_path"),
                "decision": c.get("decision"),
                "plain_title": c.get("decision", ""),
                "why": c.get("why"),
                "analogy": "",
                "mentor_tip": "",
                "author": c.get("author_name") or "Teammate",
                "author_email": c.get("author_email") or "",
                "author_role": "Team Contributor",
                "category": c.get("category", "architecture"),
                "alternatives": c.get("alternatives", []),
                "quiz": c.get("quiz", {}),
                "timestamp": c.get("created_at")
            })

    # 2. Live in-memory cards matching project_id
    for c in cards:
        if project_id and c.get("project_id") != project_id:
            continue
        if not any(existing.get("id") == c.get("id") for existing in pool):
            card_copy = dict(c)
            if "author" not in card_copy:
                card_copy["author"] = "You (Local Dev)"
            pool.append(card_copy)

    # 3. Sam's demo cards are only for the no-project demo. A real project must never show fake teammates.
    if not pool and not project_id:
        for sc in SAM_CUE_CARDS:
            pool.append(dict(sc))

    return pool

def retrieve_relevant_cards(question: str, candidate_cards: list, max_results: int = 3):
    """Keyword-based search over collective cue cards for hackathon retrieval."""
    if not question or not candidate_cards:
        return []

    words = re.findall(r'\b[a-zA-Z0-9]+\b', question.lower())
    stopwords = {
        'why', 'did', 'the', 'this', 'that', 'way', 'how', 'is', 'a', 'an', 'to', 'in',
        'and', 'for', 'of', 'on', 'with', 'do', 'does', 'what', 'can', 'you', 'tell',
        'me', 'about', 'structure', 'write', 'code', 'file', 'logic', 'our', 'we', 'he', 'she', 'use',
        'work', 'works', 'there', 'they', 'them'
    }
    keywords = [w for w in words if w not in stopwords and len(w) > 2]
    if not keywords:
        return []

    scored = []
    for card in candidate_cards:
        score = 0
        file_text = str(card.get("file", "")).lower()
        author_text = str(card.get("author", "")).lower()
        decision_text = str(card.get("decision", "")).lower()
        plain_title_text = str(card.get("plain_title", "")).lower()
        why_text = str(card.get("why", "")).lower()
        analogy_text = str(card.get("analogy", "")).lower()
        mentor_text = str(card.get("mentor_tip", "")).lower()
        category_text = str(card.get("category", "")).lower()

        alt_texts = []
        for alt in card.get("alternatives", []):
            if isinstance(alt, dict):
                alt_texts.append(str(alt.get("option", "")).lower())
                alt_texts.extend([str(p).lower() for p in alt.get("pros", [])])
                alt_texts.extend([str(c).lower() for c in alt.get("cons", [])])
        alts_combined = " ".join(alt_texts)

        for kw in keywords:
            pattern = r'\b' + re.escape(kw)
            if re.search(pattern, file_text):
                score += 5
            elif re.search(pattern, plain_title_text) or re.search(pattern, decision_text):
                score += 4
            elif re.search(pattern, why_text) or re.search(pattern, analogy_text):
                score += 3
            elif re.search(pattern, author_text):
                score += 2
            elif re.search(pattern, mentor_text) or re.search(pattern, category_text) or re.search(pattern, alts_combined):
                score += 1

        if score > 0:
            scored.append((score, card))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [card for _, card in scored[:max_results]]

@app.route("/team-cards", methods=["GET"])
def get_team_cards():
    """Returns the collective pool of cards across all teammates (scoped to project_id)."""
    project_id = request.args.get("project_id")
    return jsonify(get_all_collective_cards(project_id=project_id))

class TeamSource:
    """Where team search reads a project's notes from: lessons, shared sessions, shared edits, and who is who."""

    def __init__(self, project_id):
        self.project_id = project_id

    def cards(self):
        return get_all_collective_cards(project_id=self.project_id)

    def sessions(self):
        rows, _err = list_project_sessions(self.project_id, limit=200) if self.project_id else ([], None)
        return rows

    def names(self):
        emails = get_project_member_emails(self.project_id) if self.project_id else {}
        return {uid: friendly_name(email) for uid, email in emails.items()}

    def newest_events(self):
        rows, _err = newest_session_events(self.project_id) if self.project_id else ([], None)
        return rows

    def events_since(self, after_id):
        rows, _err = session_events_after(self.project_id, after_id) if self.project_id else ([], None)
        return rows


@app.route("/ask-team", methods=["POST"])
def ask_team():
    """
    Answer a question about the team's work. The search runs locally and only what it finds reaches the
    model, so answers are grounded, cheap, and cached. See team_qa.py for how cost is controlled.
    """
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    project_id = data.get("project_id") or request.args.get("project_id")
    if not question:
        return jsonify({"error": "Missing question in request body"}), 400

    asker_id = get_user_id_from_token(request.headers.get("Authorization")) or ""
    return jsonify(team_qa.answer(question, TeamSource(project_id), project_id or "demo", asker_id))


@app.route("/llm/status", methods=["GET"])
def llm_status():
    """The AI spending limit and how question answering is going, for Team Brain."""
    return jsonify({
        **budget_guard.status(),
        "configured": llm_client.configured,
        "reason": llm_client.not_configured_reason,
        "model": llm_client.model,
        "tier": llm_client.tier,
        "stats": team_qa.stats,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    # Under the debug reloader only the child process (WERKZEUG_RUN_MAIN) should tail
    # transcripts, otherwise every AGY event would be captured twice.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        TranscriptWatcher(f"http://127.0.0.1:{port}").start_background()
    app.run(host="0.0.0.0", port=port, debug=True)
