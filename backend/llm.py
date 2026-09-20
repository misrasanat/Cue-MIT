"""
Client for Meta's Model API (Muse Spark). This is the only place Cue spends money on answering questions.

Facts this is built around (from Meta's docs and measured against the live API):
- Chat Completions live at https://api.meta.ai/v1/chat/completions, with a bearer key.
- Standard models bill $1.25 / $4.25 per million input / output tokens, and cached input at $0.15.
- They are reasoning models: hidden "thinking" tokens are part of `completion_tokens` and billed as output,
  so reasoning is kept at "minimal" and the output cap is generous enough that an answer is never cut off.
- The "-contributor" models are cheaper because Meta may train on your prompts. Prompts here contain a
  team's code, so those models are refused unless someone opts in with META_ALLOW_TRAINING_TIER=1.
"""

import json
import os
import random
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

DEFAULT_BASE = "https://api.meta.ai/v1"
DEFAULT_MODEL = "muse-spark-1.3"

# USD per 1M tokens, straight from Meta's pricing page. Override with META_PRICE_INPUT / _CACHED / _OUTPUT.
PRICING = {
    "standard": {"input": 1.25, "cached": 0.15, "output": 4.25},
    "contributor": {"input": 0.10, "cached": 0.002, "output": 0.20},
}


class LLMError(Exception):
    """Base class. `kind` tells callers how to react without parsing messages."""
    kind = "error"


class LLMNotConfigured(LLMError):
    kind = "not_configured"


class LLMBillingError(LLMError):  # HTTP 402: out of credits, or billing not set up
    kind = "billing"


class LLMRateLimited(LLMError):
    kind = "rate_limited"


class LLMUnavailable(LLMError):
    kind = "unavailable"


@dataclass
class LLMResult:
    text: str
    prompt_tokens: int
    cached_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    cost_usd: float
    model: str
    finish_reason: str
    seconds: float


def _float_env(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class MetaClient:
    def __init__(self, api_key=None, base=None, model=None, timeout=60):
        self.api_key = (api_key or os.environ.get("META_API_KEY") or os.environ.get("MODEL_API_KEY") or "").strip()
        self.base = (base or os.environ.get("META_API_BASE") or DEFAULT_BASE).rstrip("/")
        self.model = (model or os.environ.get("META_MODEL") or DEFAULT_MODEL).strip()
        self.timeout = timeout
        self.allow_training_tier = os.environ.get("META_ALLOW_TRAINING_TIER", "").strip() == "1"

    # -- configuration ---------------------------------------------------------------------------
    @property
    def tier(self):
        return "contributor" if self.model.endswith("-contributor") else "standard"

    @property
    def not_configured_reason(self):
        if not self.api_key:
            return "No Meta API key. Add META_API_KEY to backend/.env."
        if self.tier == "contributor" and not self.allow_training_tier:
            return ("This model lets Meta train on your prompts, which include your team's code. "
                    "Pick a standard model, or set META_ALLOW_TRAINING_TIER=1 if you are sure.")
        return None

    @property
    def configured(self):
        return self.not_configured_reason is None

    def prices(self):
        base = PRICING[self.tier]
        return {
            "input": _float_env("META_PRICE_INPUT", base["input"]),
            "cached": _float_env("META_PRICE_CACHED", base["cached"]),
            "output": _float_env("META_PRICE_OUTPUT", base["output"]),
        }

    # -- cost ------------------------------------------------------------------------------------
    @staticmethod
    def estimate_tokens(messages):
        """Deliberately high (one token per 3 characters) so estimates never undercount."""
        return sum(len(m.get("content") or "") for m in messages) // 3 + 8 * len(messages)

    def estimate_cost(self, messages, max_tokens):
        """An upper bound: every input token uncached, and the whole output allowance used."""
        p = self.prices()
        return (self.estimate_tokens(messages) * p["input"] + max_tokens * p["output"]) / 1e6

    def cost_of(self, prompt_tokens, cached_tokens, completion_tokens):
        p = self.prices()
        fresh = max(prompt_tokens - cached_tokens, 0)
        return (fresh * p["input"] + cached_tokens * p["cached"] + completion_tokens * p["output"]) / 1e6

    # -- request ---------------------------------------------------------------------------------
    def chat(self, messages, max_tokens=1500, reasoning_effort="minimal"):
        reason = self.not_configured_reason
        if reason:
            raise LLMNotConfigured(reason)

        body = {
            "model": self.model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "reasoning_effort": reasoning_effort,
            # Meta caches a repeated prompt prefix at ~88% off; a stable system prompt first makes that automatic.
            "prompt_cache_retention": "24h",
        }
        payload = json.dumps(body).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        started = time.time()
        for attempt in range(4):
            request = urllib.request.Request(f"{self.base}/chat/completions", data=payload, headers=headers)
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    data = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as e:
                message = self._error_message(e)
                if e.code == 402:
                    raise LLMBillingError(message) from e
                if e.code in (401, 403):
                    raise LLMNotConfigured(f"Meta rejected the API key ({e.code}): {message}") from e
                # Meta's API sometimes answers a valid request with a false 404 "model was not found" (roughly one call
                # in five). It is not billed and succeeds on retry, so treat it like any other passing error.
                flaky_404 = e.code == 404 and "model" in message.lower() and "not found" in message.lower()
                if (e.code in (429, 500, 503) or flaky_404) and attempt < 3:
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    time.sleep(min(float(retry_after), 8) if retry_after and retry_after.isdigit()
                               else (0.6 * 2 ** attempt) + random.random())
                    continue
                if e.code == 429:
                    raise LLMRateLimited(message) from e
                raise LLMUnavailable(f"Meta API error {e.code}: {message}") from e
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                if attempt < 2:
                    time.sleep(0.6 * 2 ** attempt)
                    continue
                raise LLMUnavailable(f"Couldn't reach the Meta API: {e}") from e

        choice = (data.get("choices") or [{}])[0]
        usage = data.get("usage") or {}
        prompt = int(usage.get("prompt_tokens") or 0)
        completion = int(usage.get("completion_tokens") or 0)
        cached = int((usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
        reasoning = int((usage.get("completion_tokens_details") or {}).get("reasoning_tokens") or 0)
        return LLMResult(
            text=((choice.get("message") or {}).get("content") or "").strip(),
            prompt_tokens=prompt, cached_tokens=cached, completion_tokens=completion, reasoning_tokens=reasoning,
            cost_usd=self.cost_of(prompt, cached, completion), model=data.get("model") or self.model,
            finish_reason=choice.get("finish_reason") or "", seconds=time.time() - started,
        )

    @staticmethod
    def _error_message(error):
        try:
            return json.loads(error.read().decode("utf-8")).get("error", {}).get("message") or str(error)
        except Exception:
            return str(error)
