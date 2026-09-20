import os
import re
import time
import uuid
import datetime
import jwt
from supabase import create_client, Client

try:
    import public_mode
except ImportError:  # imported as backend.supabase_client
    from . import public_mode

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
    "91a89d99-8062-4fb1-8c39-e65d7c010b4d": "misrasanat123@gmail.com",
    "sam-teammate-id": "sam@acmecorp.internal"
}

def register_user_email(user_id, email):
    if user_id and email:
        USER_EMAIL_MAP[str(user_id)] = str(email).strip().lower()

_jwks = None


def _must_verify_tokens():
    """A public server must check logins; your own computer trusts them (a saved login may be older than an hour)."""
    return public_mode.is_public() or bool(os.environ.get("SUPABASE_JWT_SECRET", "").strip())


def _jwks_client():
    """Supabase publishes the public keys that verify logins, so no secret is needed for the newer signing keys."""
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
    return _jwks


def _decode_verified(token):
    """Checks that Supabase really signed the token, that it is meant for logged-in users, and that it has not expired."""
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":  # older projects sign with a shared secret
        secret = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
        if not secret:
            raise jwt.InvalidTokenError("this token needs SUPABASE_JWT_SECRET to be verified")
        return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated", leeway=10)
    if alg in ("ES256", "RS256"):  # newer projects sign with a private key and publish the public one
        key = _jwks_client().get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=[alg], audience="authenticated", leeway=10)
    raise jwt.InvalidAlgorithmError(f"unsupported token algorithm: {alg}")  # includes 'none'


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
        if _must_verify_tokens():
            decoded = _decode_verified(token)
        else:
            # Your own computer trusts the saved login, which can be older than the token's lifetime.
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
    """
    Returns the member list for a project with real emails queried from
    Supabase project_members and invites tables.
    """
    if not supabase or not project_id:
        return []
    try:
        # 1. Fetch project to know the creator
        project_res = supabase.table("projects").select("*").eq("id", project_id).execute()
        project = project_res.data[0] if project_res.data else None
        creator_id = project.get("created_by") if project else None

        # 2. Fetch project_members
        res = supabase.table("project_members").select("*").eq("project_id", project_id).order("joined_at", desc=False).execute()
        members = res.data or []

        # 3. Fetch invites for this project
        inv_res = supabase.table("invites").select("*").eq("project_id", project_id).order("created_at", desc=False).execute()
        invites = inv_res.data or []

        # Build dynamic email mapping
        email_by_uid = dict(USER_EMAIL_MAP)

        # Map known project creators
        if creator_id == "91a89d99-8062-4fb1-8c39-e65d7c010b4d":
            email_by_uid[creator_id] = "misrasanat123@gmail.com"
        elif creator_id == "4decb926-3bc0-471f-9b73-e30b4b1828da":
            email_by_uid[creator_id] = "dhweya.modi@outlook.com"

        # Check invites to see if any inviter email is known
        for inv in invites:
            inv_by = inv.get("invited_by")
            if inv_by and inv_by in email_by_uid:
                pass
            elif inv_by == creator_id and creator_id in email_by_uid:
                email_by_uid[inv_by] = email_by_uid[creator_id]

        accepted_invites = [inv for inv in invites if inv.get("status") == "accepted"]

        # Assign emails to members
        assigned_emails = set()
        unassigned_members = []
        for m in members:
            uid = m.get("user_id")
            if uid in email_by_uid:
                m["email"] = email_by_uid[uid]
                assigned_emails.add(email_by_uid[uid])
            else:
                unassigned_members.append(m)

        # Match unassigned members with accepted invites
        remaining_invites = [inv for inv in accepted_invites if inv.get("invited_email") not in assigned_emails]
        for idx, m in enumerate(unassigned_members):
            if idx < len(remaining_invites):
                matched_email = remaining_invites[idx]["invited_email"]
                m["email"] = matched_email
                uid = m.get("user_id")
                if uid:
                    email_by_uid[uid] = matched_email
                    register_user_email(uid, matched_email)
            else:
                uid = m.get("user_id", "")
                m["email"] = f"user-{uid[:8]}@team.internal"

        # Append pending invites so the team can see who has been invited
        pending_invites = [inv for inv in invites if inv.get("status") == "pending"]
        for pinv in pending_invites:
            members.append({
                "project_id": project_id,
                "user_id": f"pending-{pinv.get('id')[:8]}",
                "email": pinv.get("invited_email"),
                "role": "invite pending",
                "joined_at": pinv.get("created_at"),
                "is_pending": True
            })

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

def save_cue_card(user_id, card_data, project_id=None):
    """
    Saves a card to Supabase. Returns {"shared": bool, "error": str|None}.
    When Supabase rejects the write (for example a row-level-security policy) the card is kept in
    this process's memory only, which no teammate can see, so callers must tell the user.
    """
    if not user_id:
        return {"shared": False, "error": "not signed in"}
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
    error = "Supabase is not connected"
    if supabase:
        try:
            res = supabase.table("cue_cards").insert(data).execute()
            if res.data:
                return {"shared": True, "error": None}
            error = "Supabase accepted the request but stored nothing"
        except Exception as e:
            error = str(e)
            print(f"[Supabase DB Note] Fallback to in-memory card store: {e}")

    IN_MEMORY_CUE_CARDS.append(data)
    return {"shared": False, "error": error}

def save_cue_card_to_db(user_id, card_data, project_id=None):
    """Backwards-compatible wrapper around save_cue_card that returns the stored row."""
    save_cue_card(user_id, card_data, project_id=project_id)
    return [card_data]

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

def friendly_name(email):
    """'dhweya.modi@outlook.com' -> 'Dhweya Modi'. Placeholder addresses become 'Teammate'."""
    if not email or "@" not in str(email):
        return "Teammate"
    local, _, domain = str(email).partition("@")
    if domain.endswith("team.internal") and local.startswith("user-"):
        return "Teammate"
    words = [re.sub(r"\d+$", "", w) for w in re.split(r"[._\-+]+", local) if w]
    words = [w for w in words if w]
    return " ".join(w.capitalize() for w in words) or "Teammate"

_MEMBER_EMAIL_CACHE = {}
_MEMBER_EMAIL_TTL = 30  # seconds; resolving members costs several queries and Team Brain polls

def get_project_member_emails(project_id):
    """Maps user_id -> email for a project's real (non-pending) members, cached briefly."""
    if not project_id:
        return {}
    now = time.time()
    hit = _MEMBER_EMAIL_CACHE.get(project_id)
    if hit and now - hit[0] < _MEMBER_EMAIL_TTL:
        return hit[1]
    mapping = {}
    for m in get_project_members(project_id):
        if not m.get("is_pending") and m.get("user_id") and m.get("email"):
            mapping[str(m["user_id"])] = m["email"]
    _MEMBER_EMAIL_CACHE[project_id] = (now, mapping)
    return mapping

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

    # Work out who wrote each card from the project's real member list, so teammates show up by name.
    member_emails = get_project_member_emails(project_id)
    for c in cards:
        uid = str(c.get("user_id") or "")
        email = member_emails.get(uid) or USER_EMAIL_MAP.get(uid)
        c["author_email"] = email or ""
        c["author_name"] = friendly_name(email)
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


# ==============================================================================
# Live session sharing (see schema_sessions.sql)
# Every function returns (result, error). `error` is a string when the database refused or the
# tables aren't set up yet, so callers can explain it instead of failing silently.
# ==============================================================================

def upsert_project_session(header):
    """Creates or updates the shared row for a session. Leaves `carded` untouched."""
    if not supabase:
        return False, "Supabase is not connected"
    try:
        supabase.table("project_sessions").upsert(header, on_conflict="id,user_id").execute()
        return True, None
    except Exception as e:
        return False, str(e)


def insert_session_events(rows):
    if not rows:
        return True, None
    if not supabase:
        return False, "Supabase is not connected"
    try:
        supabase.table("session_events").insert(rows).execute()
        return True, None
    except Exception as e:
        return False, str(e)


def list_project_sessions(project_id, limit=30):
    """Newest sessions across the whole team for a project."""
    if not supabase or not project_id:
        return [], "Supabase is not connected"
    try:
        res = (supabase.table("project_sessions").select("*").eq("project_id", project_id)
               .order("last_activity", desc=True).limit(limit).execute())
        return res.data or [], None
    except Exception as e:
        return [], str(e)


def list_recent_session_events(project_id, limit=400):
    """Recent events across a project, without the (large) diffs, newest first."""
    if not supabase or not project_id:
        return [], "Supabase is not connected"
    try:
        res = (supabase.table("session_events").select("session_id,user_id,at,kind,file,summary")
               .eq("project_id", project_id).order("at", desc=True).limit(limit).execute())
        return res.data or [], None
    except Exception as e:
        return [], str(e)


def get_session_events(project_id, user_id, session_id, limit=300):
    """One session's edits including diffs, oldest first. Used to make lessons from it."""
    if not supabase:
        return [], "Supabase is not connected"
    try:
        res = (supabase.table("session_events").select("*").eq("project_id", project_id)
               .eq("user_id", user_id).eq("session_id", session_id).order("at", desc=False)
               .limit(limit).execute())
        return res.data or [], None
    except Exception as e:
        return [], str(e)


def get_session_carded(project_id, user_id, session_id):
    """Digests of changes that already have lessons, so the same work is never paid for twice."""
    if not supabase:
        return []
    try:
        res = (supabase.table("project_sessions").select("carded").eq("project_id", project_id)
               .eq("user_id", user_id).eq("id", session_id).execute())
        rows = res.data or []
        return list(rows[0].get("carded") or []) if rows else []
    except Exception:
        return []


def add_session_carded(project_id, user_id, session_id, digests):
    if not supabase or not digests:
        return False
    try:
        merged = sorted(set(get_session_carded(project_id, user_id, session_id)) | set(digests))
        supabase.table("project_sessions").update({"carded": merged}).eq("project_id", project_id) \
            .eq("user_id", user_id).eq("id", session_id).execute()
        return True
    except Exception as e:
        print(f"[Supabase DB Note] add_session_carded failed: {e}")
        return False


# ==============================================================================
# Team search + AI spend ledger (see schema_llm.sql)
# ==============================================================================

def newest_session_events(project_id, limit=1500):
    """The most recent shared events for a project, with diffs, oldest first. Used to build the search index."""
    if not supabase or not project_id:
        return [], "Supabase is not connected"
    try:
        res = (supabase.table("session_events").select("*").eq("project_id", project_id)
               .order("id", desc=True).limit(limit).execute())
        return list(reversed(res.data or [])), None
    except Exception as e:
        return [], str(e)


def session_events_after(project_id, after_id, limit=1500):
    """Events newer than `after_id`, so the search index updates without re-downloading everything."""
    if not supabase or not project_id:
        return [], "Supabase is not connected"
    try:
        res = (supabase.table("session_events").select("*").eq("project_id", project_id)
               .gt("id", after_id).order("id", desc=False).limit(limit).execute())
        return res.data or [], None
    except Exception as e:
        return [], str(e)


def insert_llm_usage(row):
    if not supabase:
        return False, "Supabase is not connected"
    try:
        supabase.table("llm_usage").insert(row).execute()
        return True, None
    except Exception as e:
        return False, str(e)


def sum_llm_usage():
    """Total AI spend recorded by every teammate. Returns (usd or None, error)."""
    if not supabase:
        return None, "Supabase is not connected"
    try:
        total, start, page = 0.0, 0, 1000  # the API returns at most 1000 rows per request
        while True:
            res = supabase.table("llm_usage").select("cost_usd").range(start, start + page - 1).execute()
            rows = res.data or []
            total += sum(float(r.get("cost_usd") or 0) for r in rows)
            if len(rows) < page:
                return round(total, 6), None
            start += page
    except Exception as e:
        return None, str(e)


def has_llm_alert():
    """True when the team has already been told the AI budget was reached."""
    if not supabase:
        return False
    try:
        res = supabase.table("llm_usage").select("id").eq("purpose", "budget_alert").limit(1).execute()
        return bool(res.data)
    except Exception:
        return False
