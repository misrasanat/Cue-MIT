"""
Antigravity CLI Transcript Watcher
===================================
AGY (Antigravity CLI) does not fire AfterTool hooks the way Gemini CLI does.
Instead, it writes every tool call into JSONL transcript files under:
  ~/.gemini/antigravity-cli/brain/<conversation-id>/.system_generated/logs/transcript.jsonl

This watcher tails those transcripts, detects file-writing tool calls
(write_to_file, replace_file_content, multi_replace_file_content), and
forwards them to the Cue backend's /capture endpoint so they show up in the
debug stream and can be turned into Cue Cards.

Usage:
  - Imported and started as a background daemon thread by server.py on startup.
  - Can also be run standalone: python watcher.py
"""

import os
import json
import time
import threading
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BRAIN_DIR = Path.home() / ".gemini" / "antigravity-cli" / "brain"
SERVER_URL = os.environ.get("CUE_SERVER_URL", "http://127.0.0.1:5001")
POLL_INTERVAL = 1.5  # seconds between transcript polls

# Tool names (snake_case as they appear in transcript tool_calls[].name)
FILE_WRITE_TOOLS = {"write_to_file", "replace_file_content", "multi_replace_file_content"}
# Forwarded to the debug stream only (no card generation)
TELEMETRY_TOOLS = {"run_command"}
CREDENTIALS_FILE = Path.home() / ".cue" / "credentials.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _strip_quotes(value):
    """
    AGY serialises CLI arg values as JSON strings inside JSON, so string args
    arrive wrapped in extra quotes: '"path/to/file"'. Unwrap them.
    """
    if isinstance(value, str) and len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        try:
            return json.loads(value)
        except Exception:
            return value.strip('"')
    return value


NL = chr(10)


def _prefix_lines(prefix, text):
    return NL.join(prefix + line for line in str(text).splitlines())


def _build_diff(tool_name: str, args: dict) -> str:
    """Compose a readable before/after diff from AGY edit args."""
    if tool_name == "write_to_file":
        return _strip_quotes(args.get("CodeContent", "")) or ""
    chunks = _strip_quotes(args.get("ReplacementChunks"))
    if isinstance(chunks, str):
        try:
            chunks = json.loads(chunks)
        except Exception:
            chunks = None
    if not isinstance(chunks, list):
        chunks = [args]
    parts = []
    for c in chunks:
        if not isinstance(c, dict):
            continue
        old = _strip_quotes(c.get("TargetContent", ""))
        new = _strip_quotes(c.get("ReplacementContent", ""))
        parts.append(_prefix_lines("- ", old) + NL + _prefix_lines("+ ", new))
    return (NL + "..." + NL).join(parts)


def _extract_payload(conv_id: str, step_index: int, tool_name: str, args: dict) -> dict:
    """Build the /capture payload from a transcript tool call."""
    description = _strip_quotes(
        args.get("Description") or args.get("Instruction") or args.get("toolSummary") or ""
    )
    if tool_name in TELEMETRY_TOOLS:
        tool_input = {
            "file_path": "",
            "summary": f"$ {_strip_quotes(args.get('CommandLine', ''))}",
        }
    else:
        tool_input = {
            "file_path": _strip_quotes(args.get("TargetFile", args.get("AbsolutePath", ""))),
            "summary": description,
            "diff": _build_diff(tool_name, args),
        }
    return {
        "session_id": conv_id,
        "tool_name": tool_name,
        "tool_input": tool_input,
        "tool_response": {},
        "source": "agy_transcript",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }


def _auth_header():
    try:
        with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
            token = json.load(f).get("access_token")
        return f"Bearer {token}" if token else None
    except Exception:
        return None


def _post_capture(payload: dict, server_url: str = None):
    """POST a payload to /capture. Silently swallows all errors."""
    try:
        data = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        auth = _auth_header()
        if auth:
            headers["Authorization"] = auth
        req = urllib.request.Request(f"{server_url or SERVER_URL}/capture", data=data, headers=headers)
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Per-conversation watcher
# ---------------------------------------------------------------------------
class _ConversationWatcher:
    def __init__(self, conv_dir: Path, skip_history: bool = False, server_url: str = None):
        self.server_url = server_url
        self.conv_id = conv_dir.name
        self.transcript_path = (
            conv_dir / ".system_generated" / "logs" / "transcript.jsonl"
        )
        self._lines_read = 0               # how many lines we've already consumed
        self._seen_steps: set[str] = set() # (conv_id, step_index) pairs already forwarded
        if skip_history:
            # Conversation predates this watcher: don't replay old edits as new cards
            try:
                with open(self.transcript_path, "r", encoding="utf-8", errors="ignore") as fh:
                    self._lines_read = sum(1 for _ in fh)
            except Exception:
                pass

    def poll(self):
        if not self.transcript_path.exists():
            return

        try:
            with open(self.transcript_path, "r", encoding="utf-8", errors="ignore") as fh:
                all_lines = fh.readlines()

            new_lines = all_lines[self._lines_read:]
            self._lines_read = len(all_lines)

            for raw in new_lines:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    step = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                self._process_step(step)

        except Exception:
            pass

    def _process_step(self, step: dict):
        # Only PLANNER_RESPONSE steps carry tool_calls
        if step.get("type") != "PLANNER_RESPONSE":
            return

        step_index = step.get("step_index", -1)
        dedup_key = f"{self.conv_id}:{step_index}"
        if dedup_key in self._seen_steps:
            return
        self._seen_steps.add(dedup_key)

        for call in step.get("tool_calls", []):
            tool_name = call.get("name", "")
            if tool_name not in FILE_WRITE_TOOLS | TELEMETRY_TOOLS:
                continue

            args = call.get("args", {})
            try:
                payload = _extract_payload(self.conv_id, step_index, tool_name, args)
                _post_capture(payload, self.server_url)
            except Exception:
                continue
            print(f"[Cue Watcher] Captured {tool_name} -> {payload['tool_input'].get('file_path', '?')}")


# ---------------------------------------------------------------------------
# Top-level watcher (discovers conversations, manages per-conv watchers)
# ---------------------------------------------------------------------------
class TranscriptWatcher:
    """
    Polls ~/.gemini/antigravity-cli/brain/ for conversations and tails each
    conversation's transcript.jsonl for new file-writing tool calls.
    """

    def __init__(self, server_url: str = None):
        self.server_url = server_url
        self._watchers: dict[str, _ConversationWatcher] = {}
        self._running = False
        self._first_scan = True

    def _refresh_conversations(self):
        if not BRAIN_DIR.exists():
            return
        try:
            for entry in BRAIN_DIR.iterdir():
                if entry.is_dir() and entry.name not in self._watchers:
                    self._watchers[entry.name] = _ConversationWatcher(
                        entry, skip_history=self._first_scan, server_url=self.server_url
                    )
        except Exception:
            pass
        self._first_scan = False

    def _run_loop(self):
        print(f"[Cue Watcher] Started - watching {BRAIN_DIR}")
        while self._running:
            self._refresh_conversations()
            for w in list(self._watchers.values()):
                w.poll()
            time.sleep(POLL_INTERVAL)
        print("[Cue Watcher] Stopped.")

    def start_background(self) -> threading.Thread:
        """Launch the watcher as a daemon thread and return it."""
        self._running = True
        t = threading.Thread(target=self._run_loop, name="cue-transcript-watcher", daemon=True)
        t.start()
        return t

    def stop(self):
        self._running = False


# ---------------------------------------------------------------------------
# Standalone entry point (for testing)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    watcher = TranscriptWatcher()
    watcher.start_background()
    print("Watcher running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        watcher.stop()
