"""
Finds the parts of a team's work that matter for a question, without calling any model.

Why this exists: the model should only ever see the few pieces of context that can answer the question.
Everything here runs locally and costs nothing:
  * an index of the team's lessons AND live coding sessions (per session, and per file inside a session),
    refreshed incrementally so a question never re-downloads history;
  * question understanding: who is asked about, what time window, and whether it is "what has X been
    working on" (rank by recency) or a topical question (rank by relevance);
  * BM25 ranking that understands file names (retry_policy.py -> retry, policy), plurals, and a few synonyms;
  * a compact, numbered context block, with diffs trimmed to the changed lines.
"""

import datetime
import math
import re
import time
from dataclasses import dataclass, field

try:
    from share_sync import redact
except ImportError:  # imported as backend.team_search
    from .share_sync import redact

STOPWORDS = set("""a an the and or but if of to in on at by for with from as is are was were be been being am do does did done doing
have has had having it its this that these those there here i me my mine we our ours you your yours he him his she her hers they them
their theirs what which who whom whose when where why how can could should would will shall may might must not no yes so than too very
just about into over under again then once also any all some such only own same both each few more most other up down out off please
tell show give explain understand know like get got""".split())

# Words that describe "what someone did" rather than what it was about.
ACTIVITY_WORDS = set("""work worked working works been change changed changes changing build built building make made making ship shipped
recent recently latest lately today yesterday week weeks last past session sessions update updated updates stuff things thing task tasks
progress status catch summary summarize summarise overview new newest currently now right morning afternoon night day days hour hours
minute minutes ago lot etc""".split())

FILE_NOISE = set("py js jsx ts tsx md json css html txt yaml yml toml".split())

SYNONYMS = {
    "delay": ["backoff", "wait", "sleep", "pause", "jitter", "timeout"],
    "retry": ["attempt", "backoff", "resilien"],
    "auth": ["login", "token", "authent", "credential", "session", "jwt"],
    "login": ["auth", "signin", "authent", "token"],
    "db": ["database", "sql", "supabase", "table", "postgres"],
    "database": ["db", "sql", "supabase", "table", "postgres"],
    "bug": ["fix", "error", "issue", "crash", "fail"],
    "error": ["exception", "fail", "bug", "crash"],
    "slow": ["performance", "latency", "speed", "optimiz"],
    "fast": ["performance", "speed", "optimiz", "cach"],
    "cache": ["cach", "memoiz", "ttl"],
    "test": ["pytest", "spec", "assert"],
    "ui": ["frontend", "component", "css", "react", "page"],
    "frontend": ["ui", "react", "component", "css"],
    "backend": ["server", "api", "flask", "endpoint"],
    "api": ["endpoint", "route", "request", "server"],
    "secret": ["key", "token", "password", "credential"],
    "payment": ["stripe", "charge", "billing", "checkout"],
    "deploy": ["release", "ship", "publish", "pip"],
    "why": [],
}

FIELD_WEIGHTS = {"title": 3.0, "file": 3.0, "intent": 2.0, "body": 1.5, "author": 1.0, "diff": 0.6}
K1, B = 1.4, 0.75
CARD_BOOST = 1.25
_WORD = re.compile(r"[A-Za-z0-9]+")


# -- text ------------------------------------------------------------------------------------------
def split_words(text):
    """Words from prose and identifiers: 'retryPolicy', 'retry_policy.py' and 'Retry Policy' all give retry, policy."""
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(text or ""))
    return [w.lower() for w in _WORD.findall(text)]


def stem(word):
    """A small stemmer: retries/retrying/retried -> retry, changed/changes -> chang."""
    w = word
    if len(w) > 4 and w.endswith("ies"):
        w = w[:-3] + "y"
    elif len(w) > 5 and w.endswith("ing"):
        w = w[:-3]
        if len(w) > 2 and w[-1] == w[-2] and w[-1] not in "ls":
            w = w[:-1]
    elif len(w) > 4 and w.endswith("ied"):
        w = w[:-3] + "y"
    elif len(w) > 4 and w.endswith("ed"):
        w = w[:-2]
    elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        w = w[:-1]
    if len(w) > 4 and w.endswith("e"):
        w = w[:-1]
    return w


def tokens(text, drop=STOPWORDS):
    return [stem(w) for w in split_words(text) if w not in drop and w not in FILE_NOISE and len(w) > 1]


def iso_to_epoch(value):
    if not value:
        return 0.0
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def ago(epoch, now=None):
    if not epoch:
        return ""
    seconds = max(0, (now or time.time()) - epoch)
    if seconds < 90:
        return "just now"
    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hr ago"
    days = hours // 24
    return "yesterday" if days == 1 else f"{days} days ago"


def basename(path):
    return re.split(r"[\\/]", str(path or ""))[-1]


def diff_excerpt(diff, limit=600):
    """Only the changed lines of a diff, trimmed. That is what explains a change, and it is cheap to send."""
    kept = []
    for line in str(diff or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped in ("...", "+++", "---"):
            continue
        if line[:1] in "+-" or not kept:
            kept.append(line[:160])
    return redact("\n".join(kept))[:limit]


# -- documents -------------------------------------------------------------------------------------
@dataclass
class Doc:
    id: str
    kind: str                 # 'card' (a lesson), 'session' (one coding session), 'work' (one file within a session)
    title: str
    author: str
    author_id: str
    when: float
    file: str = ""
    session_id: str = ""
    source: str = ""
    fields: dict = field(default_factory=dict)
    ref: dict = field(default_factory=dict)


def build_docs(cards, sessions, events, names):
    """Turns lessons, session headers and shared edits into searchable documents."""
    docs = []
    for c in cards:
        alternatives = " ".join(str(a.get("option", "")) for a in (c.get("alternatives") or []) if isinstance(a, dict))
        body = " ".join(str(c.get(k) or "") for k in ("why", "mentor_tip", "analogy")) + " " + alternatives
        author = str(c.get("author") or "A teammate")
        author_id = str(c.get("user_id") or "")
        if not author_id:  # demo cards (like Sam's) have a name but no account, so identify them by name
            author_id = "name:" + author.lower()
            names.setdefault(author_id, author)
        docs.append(Doc(
            id=str(c.get("id")), kind="card", title=str(c.get("plain_title") or c.get("decision") or "A lesson"),
            author=author, author_id=author_id,
            when=iso_to_epoch(c.get("timestamp") or c.get("created_at")), file=str(c.get("file") or ""),
            fields={"title": f"{c.get('plain_title') or ''} {c.get('decision') or ''}", "file": str(c.get("file") or ""),
                    "body": body, "author": str(c.get("author") or "")},
            ref={"decision": c.get("decision") or "", "why": c.get("why") or "", "tip": c.get("mentor_tip") or "",
                 "alternatives": [a.get("option") for a in (c.get("alternatives") or []) if isinstance(a, dict)]},
        ))

    header = {(s.get("id"), str(s.get("user_id"))): s for s in sessions}
    by_session, by_file = {}, {}
    for e in events:
        if e.get("kind") != "edit" or not e.get("file") or e["file"] == "(sensitive file)":
            continue
        key = (e["session_id"], str(e["user_id"]))
        by_session.setdefault(key, []).append(e)
        by_file.setdefault(key + (e["file"],), []).append(e)

    def session_meta(key):
        h = header.get(key, {})
        return (str(h.get("last_intent") or ""), str(h.get("source") or ""), iso_to_epoch(h.get("last_activity")))

    for key, evs in by_session.items():
        sid, uid = key
        intent, source, last = session_meta(key)
        author = names.get(uid, "A teammate")
        when = max([last] + [iso_to_epoch(e.get("at")) for e in evs])
        files = list(dict.fromkeys(e["file"] for e in evs))
        summaries = list(dict.fromkeys(str(e.get("summary") or "") for e in evs if e.get("summary")))
        docs.append(Doc(
            id=f"session:{uid}:{sid}", kind="session", title=intent or f"Worked on {', '.join(basename(f) for f in files[:3])}",
            author=author, author_id=uid, when=when, session_id=sid, source=source,
            fields={"title": intent, "file": " ".join(files), "intent": intent, "body": " ".join(summaries), "author": author},
            ref={"intent": intent, "files": files, "summaries": summaries, "edits": len(evs)},
        ))

    for key, evs in by_file.items():
        sid, uid, path = key
        intent, source, _last = session_meta((sid, uid))
        author = names.get(uid, "A teammate")
        summaries = list(dict.fromkeys(str(e.get("summary") or "") for e in evs if e.get("summary")))
        diff = "\n".join(str(e.get("diff") or "") for e in evs)
        docs.append(Doc(
            id=f"work:{uid}:{sid}:{path}", kind="work", title=f"{basename(path)}" + (f": {intent}" if intent else ""),
            author=author, author_id=uid, when=max(iso_to_epoch(e.get("at")) for e in evs), file=path, session_id=sid,
            source=source,
            fields={"title": basename(path), "file": path, "intent": intent, "body": " ".join(summaries), "diff": diff[:3000],
                    "author": author},
            ref={"intent": intent, "summaries": summaries, "diff": diff_excerpt(diff)},
        ))
    return docs


# -- ranking ---------------------------------------------------------------------------------------
class BM25Index:
    """BM25F: one relevance score across weighted fields (a match in a file name counts more than one in a diff)."""

    def __init__(self, docs):
        self.docs = docs
        self.tf, self.length, self.df = [], [], {}
        for doc in docs:
            weighted, total = {}, 0.0
            for name, text in doc.fields.items():
                weight = FIELD_WEIGHTS.get(name, 1.0)
                for term in tokens(text):
                    weighted[term] = weighted.get(term, 0.0) + weight
                    total += weight
            self.tf.append(weighted)
            self.length.append(total)
            for term in weighted:
                self.df[term] = self.df.get(term, 0) + 1
        self.avg = (sum(self.length) / len(docs)) if docs else 1.0
        self.vocab = list(self.df)

    def expand(self, stems):
        """Query terms with weights: the words asked, close spellings/forms of them, and a few synonyms."""
        terms, exact = {}, set()
        for s in stems:
            if s in self.df:
                terms[s] = max(terms.get(s, 0), 1.0)
                exact.add(s)
            if len(s) >= 4:
                near = [t for t in self.vocab if t != s and (t.startswith(s[:4]) or s.startswith(t[:4])) and len(t) >= 4]
                for t in near[:6]:
                    terms[t] = max(terms.get(t, 0), 0.6)
                if near:
                    exact.add(s)  # a close spelling still counts as covering the word that was asked
            for syn in SYNONYMS.get(s, []):
                syn_stem = stem(syn)
                for t in ([syn_stem] if syn_stem in self.df else [v for v in self.vocab if v.startswith(syn_stem)][:3]):
                    terms[t] = max(terms.get(t, 0), 0.5)
        return terms, exact

    def score(self, index, terms):
        tf, dl, total = self.tf[index], self.length[index], len(self.docs)
        score = 0.0
        for term, weight in terms.items():
            f = tf.get(term)
            if not f:
                continue
            idf = math.log(1 + (total - self.df[term] + 0.5) / (self.df[term] + 0.5))
            score += weight * idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * dl / self.avg))
        return score


# -- understanding the question --------------------------------------------------------------------
def detect_people(question, people, asker_id):
    """Which teammates is the question about? people maps user id -> display name."""
    words = set(w.replace("'s", "") for w in re.findall(r"[a-z0-9']+", question.lower()))
    found = []
    for uid, name in people.items():
        parts = [p for p in split_words(name) if len(p) >= 3]
        if parts and any(p in words for p in parts) and uid != asker_id:
            found.append(uid)
    if asker_id and words & {"i", "my", "mine", "me", "i've", "ive"}:
        found.append(asker_id)
    if not found and words & {"she", "he", "her", "his", "they", "their", "them", "him"}:
        others = [u for u in people if u != asker_id]
        if len(others) == 1:  # "what did she work on" is unambiguous on a two-person team
            found.append(others[0])
    return list(dict.fromkeys(found))


def detect_time(question, now):
    """A time window: {since, until, hard, label}. 'Recently' only ranks by recency; 'yesterday' filters."""
    q = question.lower()
    today = datetime.datetime.fromtimestamp(now).replace(hour=0, minute=0, second=0, microsecond=0)
    day = datetime.timedelta(days=1)
    if re.search(r"\byesterday\b", q):
        return {"since": (today - day).timestamp(), "until": today.timestamp(), "hard": True, "label": "yesterday"}
    if re.search(r"\btoday\b|\bthis morning\b|\bthis afternoon\b|\btonight\b", q):
        return {"since": today.timestamp(), "until": now + 60, "hard": True, "label": "today"}
    if re.search(r"\blast week\b", q):
        monday = today - datetime.timedelta(days=today.weekday())
        return {"since": (monday - 7 * day).timestamp(), "until": monday.timestamp(), "hard": True, "label": "last week"}
    if re.search(r"\bthis week\b", q):
        monday = today - datetime.timedelta(days=today.weekday())
        return {"since": monday.timestamp(), "until": now + 60, "hard": True, "label": "this week"}
    m = re.search(r"\b(?:last|past|previous)\s+(\d+)\s*(minute|min|hour|hr|day|week)s?\b", q)
    if m:
        unit = {"minute": 60, "min": 60, "hour": 3600, "hr": 3600, "day": 86400, "week": 604800}[m.group(2)]
        return {"since": now - int(m.group(1)) * unit, "until": now + 60, "hard": True, "label": f"the last {m.group(1)} {m.group(2)}s"}
    if re.search(r"\b(recent|recently|lately|latest|newest|last session|just now|right now|currently|these days)\b", q):
        return {"since": now - 14 * 86400, "until": now + 60, "hard": False, "label": "recently"}
    return None


ACTIVITY_PHRASES = re.compile(
    r"\b(working on|worked on|been up to|catch me up|what'?s new|what is new|recent(ly)?|latest|lately|summar(y|ise|ize)|overview|"
    r"progress|status|who'?s (working|touching|changing))\b")


@dataclass
class Retrieval:
    intent: str                      # 'activity' or 'topical'
    docs: list
    people: list = field(default_factory=list)
    time_label: str = ""
    low_confidence: bool = False
    coverage: float = 1.0
    note: str = ""
    person_missing: bool = False


class ProjectIndex:
    def __init__(self, docs, names, fingerprint):
        self.docs, self.names, self.fingerprint = docs, names, fingerprint
        self.bm25 = BM25Index(docs)


def retrieve(question, index, asker_id="", now=None, k=6):
    now = now or time.time()
    docs = index.docs
    people = detect_people(question, index.names, asker_id)
    window = detect_time(question, now)

    q_words = [w for w in split_words(question)]
    person_words = {w for uid in people for w in split_words(index.names.get(uid, ""))}
    topical_words = [w for w in q_words if w not in STOPWORDS and w not in ACTIVITY_WORDS and w not in person_words
                     and w not in FILE_NOISE and len(w) > 1]
    stems = list(dict.fromkeys(stem(w) for w in topical_words))

    def allowed(doc):
        if people and doc.author_id not in people:
            return False
        if window and window["hard"] and doc.when and not (window["since"] <= doc.when <= window["until"]):
            return False
        return True

    pool = [i for i, d in enumerate(docs) if allowed(d)]
    label = window["label"] if window else ""

    def recent_work():
        """What someone has been doing: their newest sessions, each with its main files."""
        sessions = sorted((docs[i] for i in pool if docs[i].kind == "session"), key=lambda d: -d.when)[: max(k // 2, 3)]
        picked = list(sessions)
        for s in sessions:
            files = sorted((docs[i] for i in pool if docs[i].kind == "work" and docs[i].session_id == s.session_id
                            and docs[i].author_id == s.author_id), key=lambda d: -d.when)[:2]
            picked.extend(files)
        if len(picked) < 3:  # people with lessons but no live sessions
            picked.extend(sorted((docs[i] for i in pool if docs[i].kind == "card"), key=lambda d: -d.when)[:k])
        return picked[: k + 4]

    # Pure "what has X been doing" questions rank by recency, not by words.
    if not stems:
        if not pool and (people or window):
            return Retrieval("activity", [], people, label, person_missing=bool(people),
                             note="No shared activity from that person in that window.")
        return Retrieval("activity", recent_work(), people, label)

    terms, exact = index.bm25.expand(stems)
    scored = []
    for i in pool:
        s = index.bm25.score(i, terms)
        if s <= 0:
            continue
        d = docs[i]
        age_days = max(0.0, (now - d.when) / 86400) if d.when else 30
        s *= (CARD_BOOST if d.kind == "card" else 1.0) * (1 + 0.15 * math.exp(-age_days / 14))
        if d.kind == "session":
            s *= 0.9  # file-level and lesson hits are more specific than a whole-session summary
        scored.append((s, i))
    scored.sort(reverse=True)

    picked, per_key = [], {}
    for s, i in scored:
        d = docs[i]
        bucket = (d.session_id or d.id, d.file)
        if per_key.get(bucket, 0) >= 1 or len(picked) >= k:
            continue
        per_key[bucket] = per_key.get(bucket, 0) + 1
        picked.append((s, d))

    coverage = len(exact) / len(stems) if stems else 1.0
    top = picked[0][0] if picked else 0.0
    if not picked:
        if people:  # they asked about a person and a topic we can't find: show that person's recent work instead
            return Retrieval("activity", recent_work(), people, label, low_confidence=True, coverage=0.0,
                             note="I couldn't find that exact topic, so here is their recent work.")
        return Retrieval("topical", [], people, label, low_confidence=True, coverage=0.0)
    return Retrieval("topical", [d for _s, d in picked], people, label,
                     low_confidence=coverage < 0.5 or top < 1.2, coverage=coverage)


# -- turning documents into model context -----------------------------------------------------------
def render_doc(n, doc, now=None, with_diff=True):
    when = ago(doc.when, now)
    where = f" in {doc.file}" if doc.file and doc.kind != "session" else ""
    head = f"[{n}] {doc.author}, {when}{where}" + (f" ({doc.source.replace('_', ' ')})" if doc.source else "")
    lines = [head]
    r = doc.ref
    if doc.kind == "card":
        lines.append(f"Lesson: {r['decision'] or doc.title}")
        if r["why"]:
            lines.append(f"Why: {r['why'][:500]}")
        if r["tip"]:
            lines.append(f"Takeaway: {r['tip'][:200]}")
        if r["alternatives"]:
            lines.append("Alternatives considered: " + "; ".join(str(a) for a in r["alternatives"][:3]))
    elif doc.kind == "session":
        if r["intent"]:
            lines.append(f"Goal: {r['intent']}")
        lines.append(f"Edited {r['edits']} time(s): " + ", ".join(basename(f) for f in r["files"][:8]))
        for s in r["summaries"][:4]:
            lines.append(f"- {s[:200]}")
    else:
        if r["intent"]:
            lines.append(f"Session goal: {r['intent']}")
        for s in r["summaries"][:3]:
            lines.append(f"Change: {s[:200]}")
        if with_diff and r["diff"]:
            lines.append("Changed lines:\n" + r["diff"])
    return "\n".join(lines)


def build_context(docs, now=None, max_chars=12000):
    """A numbered context block that fits a fixed budget: about 3,000 tokens at most."""
    blocks, used = [], 0
    for n, doc in enumerate(docs, 1):
        block = render_doc(n, doc, now)
        if used + len(block) > max_chars:
            block = render_doc(n, doc, now, with_diff=False)[: max(0, max_chars - used)]
            if not block:
                break
        blocks.append(block)
        used += len(block)
    return "\n\n".join(blocks), len(blocks)


def basic_answer(retrieval, now=None):
    """An answer written without a model, for when smart answers are paused. Still cites its sources."""
    docs = retrieval.docs
    if not docs:
        return ""
    lines = []
    if retrieval.intent == "activity":
        by_author = {}
        for n, d in enumerate(docs, 1):
            by_author.setdefault(d.author, []).append((n, d))
        for author, items in by_author.items():
            parts = []
            for n, d in items:
                if d.kind == "session":
                    files = ", ".join(basename(f) for f in d.ref["files"][:4])
                    parts.append(f"{d.title} ({files}, {ago(d.when, now)}) [{n}]")
                elif d.kind == "card":
                    parts.append(f"{d.title} [{n}]")
            if parts:
                lines.append(f"{author} has recently worked on: " + "; ".join(parts[:3]) + ".")
    else:
        for n, d in list(enumerate(docs, 1))[:3]:
            if d.kind == "card":
                lines.append(f"{d.author} ({ago(d.when, now)}): {d.ref['decision'] or d.title}. {d.ref['why'][:220]} [{n}]")
            else:
                said = (d.ref.get("summaries") or [d.ref.get("intent") or "changed this"])[0]
                lines.append(f"{d.author} ({ago(d.when, now)}) worked on {basename(d.file) or 'this'}: {said} [{n}]")
    return "\n".join(lines)


# -- keeping the index fresh -----------------------------------------------------------------------
class IndexCache:
    """Per-project indexes, refreshed at most every `ttl` seconds and only re-built when the data changed."""

    def __init__(self, ttl=20, clock=time.time, max_events=6000):
        self.ttl, self.clock, self.max_events = ttl, clock, max_events
        self._entries = {}

    def get(self, key, source):
        now = self.clock()
        entry = self._entries.get(key)
        if entry and now - entry["loaded"] < self.ttl:
            return entry["index"]

        cards, sessions, names = source.cards(), source.sessions(), source.names()
        events = entry["events"] if entry else []
        last_id = max([int(e.get("id") or 0) for e in events] or [0])
        fresh = source.events_since(last_id) if entry else source.newest_events()
        events = (events + fresh)[-self.max_events:]

        fingerprint = "|".join([
            f"c{len(cards)}:{max([str(c.get('timestamp') or c.get('created_at') or '') for c in cards] or [''])}",
            f"s{len(sessions)}:{max([str(s.get('last_activity') or '') for s in sessions] or [''])}",
            f"e{len(events)}:{max([int(e.get('id') or 0) for e in events] or [0])}",
            f"n{len(names)}",
        ])
        if entry and entry["index"].fingerprint == fingerprint:
            entry["loaded"], entry["events"] = now, events
            return entry["index"]
        index = ProjectIndex(build_docs(cards, sessions, events, names), names, fingerprint)
        self._entries[key] = {"index": index, "events": events, "loaded": now}
        return index
