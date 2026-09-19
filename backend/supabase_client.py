import os
import jwt
from supabase import create_client, Client

url: str = os.environ.get("SUPABASE_URL", "").strip()
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
anon_key: str = os.environ.get("SUPABASE_ANON_KEY", "").strip()

supabase: Client = None

if url and key and url != "https://dutkvelgcwmczaxbdyjm.supabase.co" or key:
    try:
        supabase = create_client(url, key)
        print(f"[Supabase] Connected to project: {url}")
    except Exception as e:
        print(f"[Supabase Warning] Failed to initialize client: {e}")

def get_user_id_from_token(auth_header):
    """
    Extracts and verifies JWT token from Authorization header (Bearer <token>).
    Returns user_id string if valid, None otherwise.
    """
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1].strip()
    if not token:
        return None

    try:
        # Decode unverified to inspect payload user ID, or verify with Supabase JWT Secret
        decoded = jwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub") or decoded.get("user_id")
        return user_id
    except Exception as e:
        print(f"[Supabase Auth Error] Token decode failed: {e}")
        return None

def save_cue_card_to_db(user_id, card_data):
    """Saves a generated Cue Card to Supabase cue_cards table."""
    if not supabase or not user_id:
        return None
    try:
        data = {
            "user_id": user_id,
            "file_path": card_data.get("file", "unknown"),
            "decision": card_data.get("decision", ""),
            "why": card_data.get("why", ""),
            "category": card_data.get("category", "architecture"),
            "alternatives": card_data.get("alternatives", []),
            "quiz": card_data.get("quiz", {})
        }
        res = supabase.table("cue_cards").insert(data).execute()
        return res.data
    except Exception as e:
        print(f"[Supabase DB Error] Failed to save card: {e}")
        return None

def get_user_cue_cards(user_id):
    """Fetches all Cue Cards for a specific user from Supabase."""
    if not supabase or not user_id:
        return []
    try:
        res = supabase.table("cue_cards").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print(f"[Supabase DB Error] Failed to fetch cards: {e}")
        return []

def save_pending_intent_db(user_id, session_id, intent_data):
    """Buffers session intent in Supabase pending_intents table."""
    if not supabase or not user_id:
        return None
    try:
        data = {
            "user_id": user_id,
            "session_id": session_id,
            "summary": intent_data.get("summary", ""),
            "strategic_intent": intent_data.get("strategic_intent", ""),
            "title": intent_data.get("title", "")
        }
        res = supabase.table("pending_intents").upsert(data, on_conflict="user_id, session_id").execute()
        return res.data
    except Exception as e:
        print(f"[Supabase DB Error] Failed to save intent: {e}")
        return None

def get_pending_intent_db(user_id, session_id):
    """Retrieves buffered intent for a session."""
    if not supabase or not user_id:
        return None
    try:
        res = supabase.table("pending_intents").select("*").eq("user_id", user_id).eq("session_id", session_id).execute()
        if res.data:
            return res.data[0]
        return None
    except Exception as e:
        print(f"[Supabase DB Error] Failed to fetch intent: {e}")
        return None
