import os
import sys
import json
from pathlib import Path

def get_gemini_settings_path():
    """Returns the path to the user's global Gemini CLI settings file (~/.gemini/settings.json)."""
    return Path.home() / ".gemini" / "settings.json"

def install_global_hook():
    """
    Automatically registers Cue's capture hook globally in ~/.gemini/settings.json.
    - Creates ~/.gemini directory if missing.
    - Preserves existing user settings and other hooks.
    - Dynamically resolves absolute paths to python and capture.py.
    """
    try:
        settings_path = get_gemini_settings_path()
        settings_dir = settings_path.parent
        settings_dir.mkdir(parents=True, exist_ok=True)

        # Resolve absolute paths
        backend_dir = Path(__file__).parent.resolve()
        capture_script = backend_dir / "capture.py"
        python_exe = sys.executable

        # Build command string with quotes for path safety
        command_str = f'"{python_exe}" "{capture_script}"'

        cue_hook_config = {
          "name": "cue-capture",
          "type": "command",
          "command": command_str
        }

        # Read existing settings if present
        data = {}
        if settings_path.exists():
            try:
                with open(settings_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                print(f"[Cue Auto-Hook] Warning: Failed to parse existing {settings_path}: {e}")
                data = {}

        # Ensure nested structure exists
        if "hooks" not in data or not isinstance(data["hooks"], dict):
            data["hooks"] = {}

        if "AfterTool" not in data["hooks"] or not isinstance(data["hooks"]["AfterTool"], list):
            data["hooks"]["AfterTool"] = []

        after_tool_hooks = data["hooks"]["AfterTool"]

        # Find matcher entry or create new one
        target_matcher = "update_topic|write_file|replace"
        matcher_group = None

        for group in after_tool_hooks:
            if isinstance(group, dict) and group.get("matcher") == target_matcher:
                matcher_group = group
                break

        if not matcher_group:
            matcher_group = {
                "matcher": target_matcher,
                "hooks": []
            }
            after_tool_hooks.append(matcher_group)

        # Ensure hooks array exists in group
        if "hooks" not in matcher_group or not isinstance(matcher_group["hooks"], list):
            matcher_group["hooks"] = []

        # Check if cue-capture hook already exists
        hooks_list = matcher_group["hooks"]
        existing_hook = None
        for h in hooks_list:
            if isinstance(h, dict) and h.get("name") == "cue-capture":
                existing_hook = h
                break

        if existing_hook:
            existing_hook["command"] = command_str
        else:
            hooks_list.append(cue_hook_config)

        # Write back updated settings
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        print(f"[Cue Auto-Hook] Successfully registered global Gemini CLI hook in: {settings_path}")
        return True, str(settings_path)

    except Exception as e:
        print(f"[Cue Auto-Hook] Failed to install global hook: {e}")
        return False, str(e)

def main():
    success, path_or_err = install_global_hook()
    if success:
        print(f"Hook installed successfully at {path_or_err}")
    else:
        print(f"Installation error: {path_or_err}")

if __name__ == "__main__":
    main()
