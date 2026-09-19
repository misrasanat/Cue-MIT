#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
from pathlib import Path

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

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "status":
        cred = get_saved_credentials()
        if cred:
            print(f"Logged in as: {cred.get('email')} (ID: {cred.get('user_id')})")
        else:
            print("Not logged in. Run 'cue' to log in.")
    else:
        interactive_cli()

if __name__ == "__main__":
    main()
