"""
Ties a code folder to a Cue team project through a small `.cue/project.json` file.

Only folders that have been linked (with `cue link`) are ever shared with the team. Finding the link
starts from the file being edited and walks up the folder tree, so it works for any CLI, including
Antigravity, whose events carry a file path but no working directory.
"""

import json
import os
import time
from pathlib import Path

LINK_DIR = ".cue"
LINK_FILE = "project.json"

_CACHE_SECONDS = 30
_cache = {}


def find_link(start):
    """
    Nearest link at or above `start` (a file or folder, absolute path).
    Returns {"project_id", "project_name", "root"} or None.
    """
    try:
        path = Path(str(start)).expanduser()
    except Exception:
        return None
    if not start or not path.is_absolute():
        return None
    folder = path if path.is_dir() else path.parent

    key = str(folder)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_SECONDS:
        return hit[1]

    found = None
    for current in [folder, *folder.parents]:
        link = current / LINK_DIR / LINK_FILE
        if link.is_file():
            try:
                config = json.loads(link.read_text(encoding="utf-8"))
            except Exception:
                config = {}
            project_id = str(config.get("project_id") or "").strip()
            if project_id:
                found = {
                    "project_id": project_id,
                    "project_name": str(config.get("project_name") or ""),
                    "root": str(current),
                }
            break

    _cache[key] = (time.time(), found)
    return found


def relative_path(file_path, root):
    """Path of a file inside its repo, so the uploaded name never contains someone's home folder."""
    if not file_path:
        return ""
    try:
        if root:
            return Path(os.path.relpath(file_path, root)).as_posix()
    except Exception:
        pass
    return Path(str(file_path)).name


def repo_root(start=None):
    """The folder containing .git above `start`, or `start` itself when there is none."""
    folder = Path(start or os.getcwd()).resolve()
    for current in [folder, *folder.parents]:
        if (current / ".git").exists():
            return current
    return folder


def write_link(folder, project_id, project_name):
    target = Path(folder) / LINK_DIR / LINK_FILE
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps({"project_id": str(project_id), "project_name": project_name}, indent=2) + "\n",
        encoding="utf-8",
    )
    _cache.clear()
    return target


def remove_link(folder):
    target = Path(folder) / LINK_DIR / LINK_FILE
    if target.is_file():
        target.unlink()
        _cache.clear()
        return True
    return False
