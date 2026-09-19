#!/usr/bin/env python3
import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error
import threading
from pathlib import Path

CREDENTIALS_FILE = Path.home() / ".cue" / "credentials.json"
SERVER_URL = os.environ.get("CUE_SERVER_URL", "http://127.0.0.1:5001")
SERVER_PY = Path(__file__).parent / "server.py"
PYTHON_EXE = sys.executable


def get_auth_header():
    if CREDENTIALS_FILE.exists():
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                token = data.get("access_token")
                if token:
                    return f"Bearer {token}"
        except Exception:
            pass
    return None


def is_server_running():
    """Check if the Cue backend is already up by hitting /health."""
    try:
        req = urllib.request.Request(f"{SERVER_URL}/health")
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        return False


def start_server_daemon():
    """
    Launch server.py as a fully detached background process so it persists
    after capture.py exits and doesn't block the Gemini CLI.
    """
    try:
        kwargs = {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "stdin": subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            # DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP ensures the child
            # is fully independent — it won't be killed when the terminal closes.
            DETACHED_PROCESS = 0x00000008
            CREATE_NEW_PROCESS_GROUP = 0x00000200
            kwargs["creationflags"] = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        else:
            # On Unix, start_new_session detaches from the process group
            kwargs["start_new_session"] = True

        subprocess.Popen([PYTHON_EXE, str(SERVER_PY)], **kwargs)
    except Exception:
        pass


def ensure_server_ready():
    """
    If server isn't running, start it and wait up to 6 seconds for it to be ready.
    The first capture event after a cold start may be dropped if startup takes
    longer than 6 s — that's acceptable; subsequent events will be captured.
    """
    if is_server_running():
        return True

    start_server_daemon()

    # Poll every 300ms, max 6 seconds
    for _ in range(20):
        time.sleep(0.3)
        if is_server_running():
            return True

    return False  # Server didn't come up in time — payload will be silently dropped


def get_project_id():
    """Resolves project_id from CUE_PROJECT_ID env var or nearest .cue/project.json."""
    env_pid = os.environ.get("CUE_PROJECT_ID")
    if env_pid:
        return env_pid.strip()
    try:
        curr = Path.cwd()
        for p in [curr, *curr.parents]:
            proj_file = p / ".cue" / "project.json"
            if proj_file.exists():
                with open(proj_file, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    pid = cfg.get("project_id")
                    if pid:
                        return str(pid).strip()
    except Exception:
        pass
    return None


def send_payload(data):
    try:
        headers = {"Content-Type": "application/json"}
        auth = get_auth_header()
        if auth:
            headers["Authorization"] = auth
        project_id = get_project_id()
        if project_id:
            headers["X-Project-Id"] = project_id
            try:
                parsed = json.loads(data)
                if isinstance(parsed, dict) and "project_id" not in parsed:
                    parsed["project_id"] = project_id
                    data = json.dumps(parsed)
            except Exception:
                pass

        req = urllib.request.Request(
            f"{SERVER_URL}/capture",
            data=data.encode("utf-8"),
            headers=headers,
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


def main():
    try:
        raw_payload = sys.stdin.read()
        if not raw_payload.strip():
            return

        # Ensure server is up (auto-starts if needed) then send
        def _run():
            ensure_server_ready()
            send_payload(raw_payload)

        t = threading.Thread(target=_run)
        t.daemon = True
        t.start()
        t.join(timeout=7)  # enough time for cold-start + send

    except Exception:
        pass
    finally:
        # Mandatory: return valid JSON to Gemini CLI immediately with zero latency
        print("{}")
        sys.exit(0)


if __name__ == "__main__":
    main()
