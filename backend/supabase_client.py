import os
import uuid
import datetime
import jwt
from supabase import create_client, Client

DEFAULT_SUPABASE_URL = "https://dutkvelgcwmczaxbdyjm.supabase.co"
DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1dGt2ZWxnY3dtY3pheGJkeWptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NzUwNDcsImV4cCI6MjEwNTE1MTA0N30.ZxJcYcBIwzDFn--IaPbBJI6IEqKPXc42AOwm3C6Ftac"

url: str = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL).strip() or DEFAULT_SUPABASE_URL
key: str = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or DEFAULT_SUPABASE_KEY).strip()

supabase: Client = None

try:
    supabase = create_client(url, key)
    print(f"[Supabase] Connected to project: {url}")
except Exception as e:
    print(f"[Supabase Warning] Failed to initialize client: {e}")

# In-memory user email registry (maps user_id -> email for clean member listings)
USER_EMAIL_MAP = {
    "4decb926-3bc0-471f-9b73-e30b4b1828da": "dhweya.modi@outlook.com",
    "sam-teammate-id": "sam@acmecorp.internal"
}

def register_user_email(user_id, email):
    if user_id and email:
        USER_EMAIL_MAP[str(user_id)] = str(email)

def get_user_info_from_token(auth_header):
    """
    Extracts user_id and email from Authorization header (Bearer <token>).
    Returns (user_id, email) tuple.
    """
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, None
    token = auth_header.split(" ")[1].strip()
    if not token:
        return None, None

    try:
        decoded = jwt.decode(token, options={"verify_signature": False})
        user_id = decoded.get("sub") or decoded.get("user_id")
        email = decoded.get("email") or decoded.get("user_metadata", {}).get("email", "")
        if user_id and email:
            register_user_email(user_id, email)
        return user_id, email
    except Exception as e:
        print(f"[Supabase Auth Error] Token decode failed: {e}")
        return None, None

def get_user_id_from_token(auth_header):
    user_id, _ = get_user_info_from_token(auth_header)
    return user_id

# ==============================================================================
# Organizations & Projects
# ==============================================================================

def create_organization(name, created_by):
    """Creates a new organization in Supabase organizations table."""
    if not supabase or not created_by:
        return None
    try:
        data = {
            "name": name,
            "created_by": created_by
        }
        res = supabase.table("organizations").insert(data).execute()
        if res.data:
            return res.data[0]
        return None
    except Exception as e:
        print(f"[Supabase DB Error] create_organization failed: {e}")
        return None

def get_organization(org_id):
    """Retrieves an organization by id."""
    if not supabase or not org_id:
        return None
    try:
        res = supabase.table("organizations").select("*").eq("id", org_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Supabase DB Error] get_organization failed: {e}")
        return None

def create_project(organization_id, name, created_by):
    """
    Creates a new project under an organization and automatically
    adds the creator to project_members.
    """
    if not supabase or not organization_id or not created_by:
        return None
    try:
        project_data = {
            "organization_id": organization_id,
            "name": name,
            "created_by": created_by
        }
        res = supabase.table("projects").insert(project_data).execute()
        if not res.data:
            return None
        project = res.data[0]
        
        # Add creator to project_members
        add_project_member(project["id"], created_by, role="owner")
        return project
    except Exception as e:
        print(f"[Supabase DB Error] create_project failed: {e}")
        return None

def get_project(project_id):
    """Retrieves a single project by id."""
    if not supabase or not project_id:
        return None
    try:
        res = supabase.table("projects").select("*").eq("id", project_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Supabase DB Error] get_project failed: {e}")
        return None

def get_user_projects(user_id):
    """
    Returns all projects that the user belongs to (via project_members).
    """
    if not supabase or not user_id:
        return []
    try:
        memberships = supabase.table("project_members").select("project_id, role, joined_at").eq("user_id", user_id).execute()
        if not memberships.data:
            return []
        
        project_ids = [m["project_id"] for m in memberships.data]
        projects_res = supabase.table("projects").select("*").in_("id", project_ids).order("created_at", desc=True).execute()
        return projects_res.data or []
    except Exception as e:
        print(f"[Supabase DB Error] get_user_projects failed: {e}")
        return []

def add_project_member(project_id, user_id, role="member"):
    """Adds a user to project_members."""
    if not supabase or not project_id or not user_id:
        return False
    try:
        data = {
            "project_id": project_id,
            "user_id": user_id,
            "role": role
        }
        supabase.table("project_members").upsert(data, on_conflict="project_id, user_id").execute()
        return True
    except Exception as e:
        print(f"[Supabase DB Error] add_project_member failed: {e}")
        return False

def get_project_members(project_id):
    """Returns the member list for a project with emails."""
    if not supabase or not project_id:
        return []
    try:
        res = supabase.table("project_members").select("*").eq("project_id", project_id).order("joined_at", desc=False).execute()
        members = res.data or []
        for m in members:
            uid = m.get("user_id")
            m["email"] = USER_EMAIL_MAP.get(uid) or f"user-{uid[:8]}@team.internal"
        return members
    except Exception as e:
        print(f"[Supabase DB Error] get_project_members failed: {e}")
        return []

# ==============================================================================
# Invites
# ==============================================================================

def create_invite(project_id, invited_email, invited_by):
    """Creates a new invite row with status 'pending'."""
    if not supabase or not project_id or not invited_email:
        return None
    try:
        data = {
            "project_id": project_id,
            "invited_email": invited_email.strip().lower(),
            "invited_by": invited_by,
            "status": "pending"
        }
        res = supabase.table("invites").insert(data).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Supabase DB Error] create_invite failed: {e}")
        return None

def get_invite(token):
    """Fetches an invite by id (which acts as the invite token)."""
    if not supabase or not token:
        return None
    try:
        res = supabase.table("invites").select("*").eq("id", token).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Supabase DB Error] get_invite failed: {e}")
        return None

def accept_invite(token, user_id):
    """
    Accepts an invite by token, adding the user to project_members and
    updating invite status to 'accepted'.
    """
    if not supabase or not token or not user_id:
        return None, "Invalid parameters"
    try:
        invite = get_invite(token)
        if not invite:
            return None, "Invite not found or expired"
        
        project_id = invite["project_id"]
        invited_email = invite.get("invited_email")
        if invited_email:
            register_user_email(user_id, invited_email)
        
        # Add user to project_members
        add_project_member(project_id, user_id, role="member")
        
        # Update invite status
        supabase.table("invites").update({"status": "accepted"}).eq("id", token).execute()
        
        # Return project details
        project = get_project(project_id)
        return {
            "project_id": project_id,
            "project": project,
            "status": "accepted"
        }, None
    except Exception as e:
        print(f"[Supabase DB Error] accept_invite failed: {e}")
        return None, str(e)

# ==============================================================================
# Cue Cards & Pending Intents
# ==============================================================================

IN_MEMORY_CUE_CARDS = []

def save_cue_card_to_db(user_id, card_data, project_id=None):
    """Saves a generated Cue Card to Supabase cue_cards table with optional project_id."""
    if not user_id:
        return None
    data = {
        "id": str(card_data.get("id") or uuid.uuid4()),
        "user_id": user_id,
        "project_id": project_id or card_data.get("project_id"),
        "file_path": card_data.get("file", "unknown"),
        "decision": card_data.get("decision", ""),
        "why": card_data.get("why", ""),
        "category": card_data.get("category", "architecture"),
        "alternatives": card_data.get("alternatives", []),
        "quiz": card_data.get("quiz", {}),
        "created_at": datetime.datetime.now().isoformat()
    }
    if supabase:
        try:
            res = supabase.table("cue_cards").insert(data).execute()
            if res.data:
                return res.data
        except Exception as e:
            print(f"[Supabase DB Note] Fallback to in-memory card store: {e}")

    # Fallback store
    IN_MEMORY_CUE_CARDS.append(data)
    return [data]

def get_user_cue_cards(user_id):
    """Fetches all Cue Cards for a specific user from Supabase + fallback."""
    if not user_id:
        return []
    cards = []
    if supabase:
        try:
            res = supabase.table("cue_cards").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
            cards.extend(res.data or [])
        except Exception as e:
            pass
    for c in IN_MEMORY_CUE_CARDS:
        if c.get("user_id") == user_id and not any(existing.get("id") == c.get("id") for existing in cards):
            cards.append(c)
    return cards

def get_project_cue_cards(project_id):
    """Fetches all Cue Cards scoped to a specific project from Supabase + fallback."""
    if not project_id:
        return []
    cards = []
    if supabase:
        try:
            res = supabase.table("cue_cards").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
            cards.extend(res.data or [])
        except Exception as e:
            print(f"[Supabase DB Note] Fetch project cards fallback: {e}")

    for c in IN_MEMORY_CUE_CARDS:
        if c.get("project_id") == project_id and not any(existing.get("id") == c.get("id") for existing in cards):
            cards.append(c)

    for c in cards:
        uid = c.get("user_id")
        c["author_email"] = USER_EMAIL_MAP.get(uid) or (f"dev-{uid[:6]}" if uid else "team")
    return cards

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
