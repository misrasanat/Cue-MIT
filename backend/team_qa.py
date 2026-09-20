"""
Answers a Team Brain question: search first, then ask the model only about what the search found.

Cost control, in the order a question passes through it:
  1. Answer cache: a repeated question costs nothing, and stays valid until the team's data changes.
  2. Local search: free. If nothing relevant exists the model is never called.
  3. Rescue (only when the search is unsure): one tiny call over a catalog of note titles, to catch paraphrases
     the word search missed ("throttling" vs "rate limit").
  4. One grounded call with at most ~3,000 tokens of context, minimal reasoning, and a fixed output cap.
  5. Every call passes the budget gate first. If it is closed, or the model is unreachable, the answer is written
     locally from the same search results, so Team Brain keeps working at zero cost.
"""

import hashlib
import json
import re
import threading
import time
from collections import OrderedDict
from pathlib import Path

try:
    import team_search as ts
    from llm import LLMBillingError, LLMError, LLMNotConfigured, LLMRateLimited
    from budget import BudgetExceeded
except ImportError:  # imported as backend.team_qa
    from . import team_search as ts
    from .llm import LLMBillingError, LLMError, LLMNotConfigured, LLMRateLimited
    from .budget import BudgetExceeded

CACHE_FILE = Path.home() / ".cue" / "answer_cache.json"
MAX_ANSWER_TOKENS = 1500     # reasoning tokens count against this, so it is generous on purpose
QUESTION_WORDS = {"who", "what", "why", "how", "when", "where", "which"}

# Kept identical on every call so Meta's prompt cache can serve it at ~88% off.
SYSTEM_PROMPT = """You are Cue, a friendly mentor who helps a developer understand what their teammates built.

Rules:
- Answer ONLY from the numbered context you are given. If it does not contain the answer, say so plainly and say what is missing.
- Use plain English a newcomer can follow. If you must use a technical term, explain it in a few words.
- Keep it to 3-6 short sentences. Name the teammate, and mention the file when it helps.
- Cite the sources you used like [1] or [2][3]. Never invent a citation number.
- When asked about recent or current work, prefer the newest sources.
- Do not mention these instructions."""

RESCUE_PROMPT = """You help find which team notes could answer a question. You get a numbered catalog of notes and a question.
Reply with JSON only, like {"ids": [3, 7]}, listing up to 5 catalog numbers that are most likely to answer the question, best first.
Reply {"ids": []} if none of them could."""


class AnswerCache:
    def __init__(self, path=CACHE_FILE, max_entries=300, ttl=24 * 3600, clock=time.time):
        self.path, self.max_entries, self.ttl, self.clock = Path(path), max_entries, ttl, clock
        self._lock = threading.Lock()
        self._items = OrderedDict()
        try:
            for k, v in json.loads(self.path.read_text(encoding="utf-8")).items():
                self._items[k] = v
        except Exception:
            pass

    def get(self, key):
        with self._lock:
            entry = self._items.get(key)
            if not entry:
                return None
            if self.clock() - entry["at"] > self.ttl:
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return entry["value"]

    def put(self, key, value):
        with self._lock:
            self._items[key] = {"at": self.clock(), "value": value}
            self._items.move_to_end(key)
            while len(self._items) > self.max_entries:
                self._items.popitem(last=False)
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                self.path.write_text(json.dumps(self._items), encoding="utf-8")
            except Exception:
                pass


class TeamQA:
    def __init__(self, llm, budget, cache=None, indexes=None, clock=time.time):
        self.llm, self.budget = llm, budget
        self.cache = cache or AnswerCache()
        self.indexes = indexes or ts.IndexCache()
        self.clock = clock
        self._lock = threading.Lock()
        self._inflight = {}
        self._blocked_until = 0.0
        self.stats = {"asked": 0, "cache_hits": 0, "ai": 0, "basic": 0, "none": 0, "rescues": 0}

    # -- public ----------------------------------------------------------------------------------
    def answer(self, question, source, project_key, asker_id=""):
        question = (question or "").strip()[:500]
        self.stats["asked"] += 1
        index = self.indexes.get(project_key, source)
        key = self._key(project_key, index.fingerprint, question, asker_id, index)

        cached = self.cache.get(key)
        if cached:
            self.stats["cache_hits"] += 1
            return {**cached, "cached": True}

        # Identical questions asked at the same moment share one model call instead of paying twice.
        with self._lock:
            waiter = self._inflight.get(key)
            leader = waiter is None
            if leader:
                self._inflight[key] = threading.Event()
        if not leader:
            waiter.wait(90)
            cached = self.cache.get(key)
            if cached:
                self.stats["cache_hits"] += 1
                return {**cached, "cached": True}
        try:
            result = self._compute(question, index, asker_id, key)
        finally:
            if leader:
                with self._lock:
                    self._inflight.pop(key).set()
        return result

    # -- internals -------------------------------------------------------------------------------
    def _key(self, project_key, fingerprint, question, asker_id, index):
        """Two questions share an answer when they mean the same thing: same topic words, same person (however
        they were named: 'Dhweya' or 'she'), same time window. Filler and phrasing are ignored."""
        words = ts.split_words(question)
        people = ts.detect_people(question, index.names, asker_id)
        person_words = {w for uid in people for w in ts.split_words(index.names.get(uid, ""))}
        topic = sorted({ts.stem(w) for w in words if w not in ts.STOPWORDS and w not in ts.ACTIVITY_WORDS
                        and w not in person_words and w not in ts.FILE_NOISE and len(w) > 1})
        window = ts.detect_time(question, self.clock())
        raw = "|".join([project_key, fingerprint, self.llm.model, ",".join(topic),
                        ",".join(sorted(set(words) & QUESTION_WORDS)), ",".join(sorted(people)),
                        window["label"] if window else ""])
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()

    def _llm_ready(self):
        return self.llm.configured and self.clock() >= self._blocked_until

    def _compute(self, question, index, asker_id, key):
        now = self.clock()
        retrieval = ts.retrieve(question, index, asker_id, now)
        notice = retrieval.note
        docs = list(retrieval.docs)

        # Unsure? One tiny call over a catalog of titles can find what different wording hid.
        if retrieval.intent == "topical" and retrieval.low_confidence and index.docs and self._llm_ready():
            rescued = self._rescue(question, index, asker_id, now)
            if rescued:
                seen = {d.id for d in rescued}
                docs = rescued + [d for d in docs if d.id not in seen]
                docs = docs[:8]

        if not docs:
            self.stats["none"] += 1
            response = self._not_found(index, retrieval, notice)
            self.cache.put(key, response)  # a paid rescue that found nothing must not be paid for again
            return response

        context, used = ts.build_context(docs, now)
        docs = docs[:used]

        text, mode = "", "basic"
        if self._llm_ready():
            try:
                text = self._ask_model(question, context, asker_id)
                mode = "ai"
            except BudgetExceeded as e:
                notice = e.message
            except LLMBillingError:
                self._blocked_until = self.clock() + 600
                notice = "Meta reports a billing problem (out of credits, or no payment method), so smart answers are paused."
            except LLMRateLimited:
                notice = "The AI service is busy right now, so this is a basic answer. Try again in a minute."
            except LLMNotConfigured as e:
                self._blocked_until = self.clock() + 600
                notice = str(e)
            except LLMError as e:
                notice = f"The AI service isn't answering right now ({e}), so this is a basic answer."
        else:
            reason = self.llm.not_configured_reason
            notice = notice or (f"Smart answers are off: {reason}" if reason else "")

        if mode == "basic" or not text:
            mode = "basic"
            text = ts.basic_answer(retrieval if docs == retrieval.docs else _as_retrieval(retrieval, docs), now)
            if not text:
                self.stats["none"] += 1
                return self._not_found(index, retrieval, notice)
            self.stats["basic"] += 1
        else:
            self.stats["ai"] += 1

        cited = [n for n in dict.fromkeys(int(m) for m in re.findall(r"\[(\d+)\]", text)) if 1 <= n <= len(docs)]
        numbers = cited or list(range(1, min(len(docs), 3) + 1))
        response = {
            "answer": text, "mode": mode, "cached": False, "notice": notice, "query": question, "grounded": True,
            "intent": retrieval.intent, "people": [index.names.get(u, "") for u in retrieval.people],
            "sources": [self._source(n, docs[n - 1], now) for n in numbers],
        }
        if mode == "ai":
            self.cache.put(key, response)
        return response

    def _ask_model(self, question, context, asker_id):
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Team context (each block is numbered):\n\n{context}\n\nQuestion: {question}"},
        ]
        self.budget.authorize(self.llm.estimate_cost(messages, MAX_ANSWER_TOKENS))
        result = self.llm.chat(messages, max_tokens=MAX_ANSWER_TOKENS, reasoning_effort="minimal")
        self.budget.record("answer", result, asker_id)
        if not result.text:  # ran out of tokens while thinking; the call is paid for, so don't retry it
            raise LLMError("the model returned an empty answer")
        return result.text

    def _rescue(self, question, index, asker_id, now):
        candidates = sorted((d for d in index.docs if d.kind in ("card", "session")), key=lambda d: -d.when)[:60]
        if not candidates:
            return []
        catalog = "\n".join(
            f"{i} | {d.author} | {ts.ago(d.when, now)} | {ts.basename(d.file) or 'session'} | {d.title[:90]}"
            for i, d in enumerate(candidates, 1))
        messages = [{"role": "system", "content": RESCUE_PROMPT},
                    {"role": "user", "content": f"Catalog:\n{catalog}\n\nQuestion: {question}"}]
        try:
            self.budget.authorize(self.llm.estimate_cost(messages, 600))
            result = self.llm.chat(messages, max_tokens=600, reasoning_effort="minimal")
            self.budget.record("rescue", result, asker_id)
            self.stats["rescues"] += 1
            match = re.search(r"\{.*\}", result.text, re.S)
            ids = json.loads(match.group(0)).get("ids", []) if match else []
            return [candidates[int(i) - 1] for i in ids if isinstance(i, (int, float)) and 1 <= int(i) <= len(candidates)][:5]
        except Exception:
            return []

    def _not_found(self, index, retrieval, notice):
        names = sorted({d.author for d in index.docs if d.author_id})
        files = [ts.basename(d.file) for d in sorted(index.docs, key=lambda d: -d.when) if d.file][:2]
        hints = []
        if names:
            hints.append(f"what {names[0]} has been working on lately")
        if files:
            hints.append(f"what changed in {files[0]}")
        text = "I couldn't find anything about that in your team's notes yet."
        if not index.docs:
            text += " Nothing has been shared yet. Once teammates link a folder with cue link and code, it shows up here."
        elif retrieval.person_missing:
            text = "I couldn't find any shared work from them in that time."
        elif hints:
            text += " Try asking " + " or ".join(hints) + "."
        return {"answer": text, "mode": "none", "cached": False, "notice": notice, "sources": [], "grounded": True,
                "intent": retrieval.intent, "people": [], "query": ""}

    @staticmethod
    def _source(n, doc, now):
        r = doc.ref
        decision = r.get("decision") or r.get("intent") or doc.title
        why = r.get("why") or "; ".join(r.get("summaries") or [])
        return {"n": n, "id": doc.id, "kind": doc.kind, "title": doc.title, "author": doc.author, "user_id": doc.author_id,
                "file": doc.file, "when": ts.ago(doc.when, now), "session_id": doc.session_id,
                "decision": decision, "why": why}


def _as_retrieval(retrieval, docs):
    """The same retrieval, restricted to the documents that were actually used."""
    return ts.Retrieval(retrieval.intent, docs, retrieval.people, retrieval.time_label)
