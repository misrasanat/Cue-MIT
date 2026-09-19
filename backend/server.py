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
    save_cue_card_to_db,
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
)
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


def record_session_event(session_id, event, tool_name, tool_input, tool_response, project_id=None):
    """Append an edit/command/intent event to its session log (no AI call)."""
    now = datetime.datetime.now()
    with sessions_lock:
        s = _session_for(session_id, event.get("source", "gemini_cli"))
        s["last_activity"] = now.isoformat(timespec="seconds")
        if project_id:
            s["project_id"] = project_id
        if tool_name == "update_topic":
            s["last_intent"] = tool_input.get("summary", "") or tool_input.get("strategic_intent", "")
        elif tool_name in EDIT_TOOLS:
            s["events"].append({
                "ts": now.strftime("%H:%M:%S"),
                "kind": "edit",
                "tool": tool_name,
                "file": tool_input.get("file_path", ""),
                "summary": tool_input.get("summary") or s["last_intent"],
                "diff": _extract_diff(tool_input, tool_response),
            })
        else:
            s["events"].append({
                "ts": now.strftime("%H:%M:%S"),
                "kind": "command",
                "tool": tool_name,
                "file": "",
                "summary": str(tool_input.get("summary", ""))[:200],
                "diff": "",
            })
        del s["events"][:-MAX_EVENTS_PER_SESSION]
        if len(sessions) > MAX_SESSIONS:
            oldest = sorted(sessions, key=lambda k: sessions[k].get("last_activity", ""))
            for k in oldest[:len(sessions) - MAX_SESSIONS]:
                del sessions[k]
        _save_sessions()


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
        record_session_event(session_id, event, tool_name, tool_input, tool_response, project_id=project_id)
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

    # Group every edit to the same file into one change so it costs one call, not one per edit
    by_file = {}
    for e in edits:
        if e["file"]:
            by_file.setdefault(e["file"], []).append(e)

    created, skipped, done_before, deferred = [], 0, 0, 0
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
            newly_mocked.append(digest)
        else:
            newly_carded.append(digest)
        if card is None:
            skipped += 1
            continue
        project_id = s.get("project_id") or request.headers.get("X-Project-Id")
        if project_id:
            card["project_id"] = project_id
        cards.append(card)
        if user_id:
            save_cue_card_to_db(user_id, card, project_id=project_id)
        created.append(card)

    if newly_carded or newly_mocked:
        with sessions_lock:
            sessions[session_id].setdefault("carded", []).extend(newly_carded)
            sessions[session_id].setdefault("mocked", []).extend(newly_mocked)
            _save_sessions()

    return jsonify({
        "status": "ok",
        "created": len(created),
        "skipped_trivial": skipped,
        "already_generated": done_before,
        "deferred": deferred,  # click again to process the rest
        "cards": created,
    })


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
                    "author": item.get("author_email") or "Teammate",
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
    user_id, _ = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = data.get("user_id")

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
    user_id, _ = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = data.get("user_id")

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
    user_id, email = get_user_info_from_token(auth_header)
    if not user_id:
        data = request.get_json(silent=True) or {}
        user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "Unauthorized. Please log in first."}), 401

    result, err = accept_invite(token, user_id)
    if err:
        return jsonify({"error": err}), 400
    return jsonify(result), 200


@app.route("/user/projects", methods=["GET"])
def api_get_user_projects():
    auth_header = request.headers.get("Authorization")
    user_id, _ = get_user_info_from_token(auth_header)
    if not user_id:
        user_id = request.args.get("user_id")

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
                "file": c.get("file_path"),
                "decision": c.get("decision"),
                "plain_title": c.get("decision", ""),
                "why": c.get("why"),
                "analogy": "",
                "mentor_tip": "Captured during project development.",
                "author": c.get("author_email") or "Teammate",
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

    # 3. Fallback to Sam's pre-seeded historical cards if pool is empty or no project_id
    if not pool:
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

@app.route("/ask-team", methods=["POST"])
def ask_team():
    """
    Collective Knowledge Pool query endpoint.
    Retrieves matching cards across team members and synthesizes a grounded answer.
    """
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    project_id = data.get("project_id") or request.args.get("project_id")

    if not question:
        return jsonify({"error": "Missing question in request body"}), 400

    all_cards = get_all_collective_cards(project_id=project_id)
    matched_cards = retrieve_relevant_cards(question, all_cards, max_results=2)

    if not matched_cards:
        return jsonify({
            "answer": "I couldn't find any architectural decisions or Cue Cards in the team pool matching your question. Try asking about payment retry logic, backoff jitter, error classification, idempotency keys, or circuit breakers.",
            "sources": [],
            "query": question
        })

    # Grounded synthesis with Gemini if client is active
    if client:
        cards_context = []
        for c in matched_cards:
            cards_context.append({
                "author": c.get("author", "Team Member"),
                "file": c.get("file"),
                "timestamp": c.get("timestamp"),
                "decision": c.get("decision"),
                "why": c.get("why"),
                "mentor_tip": c.get("mentor_tip"),
                "alternatives": c.get("alternatives", [])
            })

        prompt = f"""Question from team member:
"{question}"

Grounded Historical Team Cards:
{json.dumps(cards_context, indent=2)}

Please provide a grounded, concise answer channeling the original author's stated reasoning:"""

        try:
            from google.genai import types
            model_name = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=ASK_TEAM_SYSTEM_INSTRUCTION
                )
            )
            answer_text = response.text.strip()
            return jsonify({
                "answer": answer_text,
                "sources": matched_cards,
                "query": question,
                "grounded": True
            })
        except Exception as e:
            print(f"[Ask-Team Warning] Gemini API call failed: {e}. Falling back to structured synthesis.")

    # Graceful fallback synthesis (offline or when API key is missing)
    primary = matched_cards[0]
    author = primary.get("author", "Sam")
    why = primary.get("why", "")
    tip = primary.get("mentor_tip", "")
    analogy = primary.get("analogy", "")

    fallback_answer = f"{author}'s Rationale: {why}"
    if analogy:
        fallback_answer += f"\n\n🧩 In Simple Terms: {analogy}"
    if tip:
        fallback_answer += f"\n\n💡 Rule of Thumb: {tip}"

    return jsonify({
        "answer": fallback_answer,
        "sources": matched_cards,
        "query": question,
        "grounded": True
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    # Under the debug reloader only the child process (WERKZEUG_RUN_MAIN) should tail
    # transcripts, otherwise every AGY event would be captured twice.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        TranscriptWatcher(f"http://127.0.0.1:{port}").start_background()
    app.run(host="0.0.0.0", port=port, debug=True)
