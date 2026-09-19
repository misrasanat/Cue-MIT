#!/usr/bin/env python3
import os
import json
import sys
import argparse

def install_hook(global_mode=True, target_dir="."):
    # 1. Dynamically locate capture.py relative to this script
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    capture_script = os.path.normpath(os.path.join(backend_dir, "capture.py"))
    
    # 2. Determine settings location (~/.gemini/settings.json for global, or ./gemini/settings.json for local)
    if global_mode:
        home_dir = os.path.expanduser("~")
        gemini_dir = os.path.join(home_dir, ".gemini")
        scope_label = "GLOBAL (~/.gemini/settings.json)"
    else:
        gemini_dir = os.path.join(target_dir, ".gemini")
        scope_label = f"PROJECT ({os.path.abspath(gemini_dir)})"
        
    os.makedirs(gemini_dir, exist_ok=True)
    settings_path = os.path.join(gemini_dir, "settings.json")
    
    settings = {}
    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
        except Exception:
            settings = {}
            
    hooks = settings.get("hooks", {})
    after_tool = hooks.get("AfterTool", [])
    
    # Filter out existing cue-capture hooks to avoid duplicates
    filtered_after_tool = []
    for item in after_tool:
        sub_hooks = item.get("hooks", [])
        if not any(h.get("name") == "cue-capture" for h in sub_hooks):
            filtered_after_tool.append(item)
            
    # Python command line using current python executable and absolute path
    python_cmd = sys.executable or "python"
    
    cue_hook = {
        "matcher": "update_topic|write_file|replace",
        "hooks": [
            {
                "name": "cue-capture",
                "type": "command",
                "command": f'"{python_cmd}" "{capture_script}"'
            }
        ]
    }
    
    filtered_after_tool.append(cue_hook)
    hooks["AfterTool"] = filtered_after_tool
    settings["hooks"] = hooks
    
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
        
    print(f"[Cue Success] Successfully configured {scope_label}")
    print(f"[Cue Info] Hook linked to script: {capture_script}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cue One-Click Hook Installer")
    parser.add_argument("--local", action="store_true", help="Install to current project directory instead of global ~/.gemini/settings.json")
    args = parser.parse_args()
    
    install_hook(global_mode=not args.local)
