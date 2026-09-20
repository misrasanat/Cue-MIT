#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.parse
from pathlib import Path

try:
    from project_link import find_link, repo_root, write_link, remove_link
except ImportError:  # installed as the backend package
    from .project_link import find_link, repo_root, write_link, remove_link

CREDENTIALS_FILE = Path.home() / ".cue" / "credentials.json"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dutkvelgcwmczaxbdyjm.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1dGt2ZWxnY3dtY3pheGJkeWptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NzUwNDcsImV4cCI6MjEwNTE1MTA0N30.ZxJcYcBIwzDFn--IaPbBJI6IEqKPXc42AOwm3C6Ftac")

def save_credentials(token, user_email, user_id):
    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "access_token": token,
        "email": user_email,
        "user_id": user_id
    }
    with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"\n[Cue Auth] Successfully authenticated as '{user_email}'!")
    print(f"[Cue Auth] Credentials saved to: {CREDENTIALS_FILE}\n")

def get_saved_credentials():
    if CREDENTIALS_FILE.exists():
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def login_or_signup(email, password, is_signup=False):
    endpoint = "/auth/v1/signup" if is_signup else "/auth/v1/token?grant_type=password"
    url = f"{SUPABASE_URL}{endpoint}"
    
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY
        }
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("access_token")
            user = data.get("user", {})
            user_id = user.get("id")
            
            if token and user_id:
                save_credentials(token, email, user_id)
                return True
            elif is_signup:
                print(f"\n✉️ Account created for '{email}'!")
                print("👉 Please check your email inbox and click the confirmation link before logging in.")
                return True
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"\n❌ Auth error ({e.code}): {err_msg}")
    except Exception as e:
        print(f"\n❌ Connection error: {e}")
    return False

def interactive_cli():
    print("========================================")
    print("      Welcome to Cue CLI Authentication ")
    print("========================================")
    saved = get_saved_credentials()
    if saved:
        print(f"Current active session: {saved.get('email')}")
        choice = input("Do you want to relogin? (y/N): ").strip().lower()
        if choice != "y":
            print("Remaining signed in.")
            return

    print("\n1. Log In")
    print("2. Create New Account")
    mode = input("Select option (1 or 2): ").strip()
    
    email = input("Email: ").strip()
    password = input("Password: ").strip()

    if mode == "2":
        login_or_signup(email, password, is_signup=True)
    else:
        login_or_signup(email, password, is_signup=False)

def _rest_get(path, token):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_projects(user_id, token):
    """The team projects this user belongs to, as [{"id", "name"}]."""
    memberships = _rest_get(f"project_members?select=project_id&user_id=eq.{urllib.parse.quote(user_id)}", token)
    ids = [m["project_id"] for m in memberships]
    if not ids:
        return []
    return _rest_get(f"projects?select=id,name&id=in.({','.join(ids)})&order=created_at.desc", token)


def link_cli():
    """`cue link`: choose which team project this folder's coding sessions are shared with."""
    creds = get_saved_credentials()
    if not creds or not creds.get("access_token") or not creds.get("user_id"):
        print("You're not logged in yet. Run 'cue' first, then try 'cue link' again.")
        return

    folder = repo_root()
    existing = find_link(str(folder / "x"))
    if existing:
        print(f"This folder is already linked to '{existing['project_name'] or existing['project_id']}'.")
        if input("Link it to a different project? (y/N): ").strip().lower() != "y":
            return

    try:
        projects = fetch_projects(creds["user_id"], creds["access_token"])
    except Exception as e:
        print(f"Couldn't load your projects: {e}\nYour login may have expired. Run 'cue' to log in again.")
        return
    if not projects:
        print("You're not in any team project yet. Create or join one in the Cue app first, then run 'cue link' again.")
        return

    print(f"\nWhich team project should sessions in {folder} be shared with?\n")
    for i, project in enumerate(projects, 1):
        print(f"  {i}. {project['name']}")
    choice = input("\nEnter a number (or press Enter to cancel): ").strip()
    if not choice:
        print("Nothing changed.")
        return
    try:
        project = projects[int(choice) - 1]
    except (ValueError, IndexError):
        print("That wasn't one of the options. Nothing changed.")
        return

    target = write_link(folder, project["id"], project["name"])
    print(f"\nLinked. From now on your coding sessions in this folder are shared with '{project['name']}'.")
    print(f"  Saved: {target}")
    print("  Commit .cue/project.json to share the link with teammates, or add .cue/ to .gitignore to keep it to yourself.")
    print("  Edits in folders that aren't linked are never shared. Run 'cue unlink' to stop sharing this folder.")


def unlink_cli():
    folder = repo_root()
    if remove_link(folder):
        print(f"Unlinked. Sessions in {folder} are no longer shared with your team.")
    else:
        print("This folder isn't linked to a team project.")


def status_cli():
    cred = get_saved_credentials()
    if cred:
        print(f"Logged in as: {cred.get('email')} (ID: {cred.get('user_id')})")
    else:
        print("Not logged in. Run 'cue' to log in.")
    link = find_link(str(repo_root() / "x"))
    if link:
        print(f"This folder shares sessions with: {link['project_name'] or link['project_id']}")
    else:
        print("This folder isn't linked to a team project. Run 'cue link' to share its sessions.")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "status":
        status_cli()
    elif command == "link":
        link_cli()
    elif command == "unlink":
        unlink_cli()
    else:
        interactive_cli()


if __name__ == "__main__":
    main()
