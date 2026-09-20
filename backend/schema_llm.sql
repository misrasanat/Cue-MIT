-- ==============================================================================
-- Cue: shared AI spend ledger
-- Run this once in the Supabase Dashboard -> SQL Editor -> New Query
--
-- Every AI answer records what it cost here, so the whole team shares ONE spending
-- limit no matter whose computer asked the question. Without this table Cue still
-- protects your credits, but each computer only counts its own spending.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.llm_usage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID,
    purpose TEXT NOT NULL DEFAULT 'answer',       -- 'answer', 'rescue', or 'budget_alert' (the limit was reached)
    model TEXT NOT NULL DEFAULT '',
    prompt_tokens INT NOT NULL DEFAULT 0,
    cached_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_purpose ON public.llm_usage(purpose);

-- Same as the other team tables: no row-level security (see schema.sql). This table holds only costs, no code.
ALTER TABLE public.llm_usage DISABLE ROW LEVEL SECURITY;
