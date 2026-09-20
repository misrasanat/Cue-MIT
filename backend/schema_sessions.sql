-- ==============================================================================
-- Cue: Live session sharing
-- Run this once in the Supabase Dashboard -> SQL Editor -> New Query
--
-- With this in place, edits made in a repo linked with `cue link` are pushed to
-- the team, so teammates see them live in Team Brain and can turn them into lessons.
-- ==============================================================================

-- One row per coding session (Gemini CLI or Antigravity), owned by whoever ran it.
CREATE TABLE IF NOT EXISTS public.project_sessions (
    id TEXT NOT NULL,                                                     -- the CLI's own session id
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'gemini_cli',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_intent TEXT NOT NULL DEFAULT '',
    edit_count INT NOT NULL DEFAULT 0,
    command_count INT NOT NULL DEFAULT 0,
    carded JSONB NOT NULL DEFAULT '[]'::jsonb,                            -- lessons already made, so nobody pays twice
    PRIMARY KEY (id, user_id)
);

-- The individual edits inside a session. Diffs are included, with obvious secrets masked.
CREATE TABLE IF NOT EXISTS public.session_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind TEXT NOT NULL,                                                   -- 'edit' or 'command'
    tool TEXT NOT NULL DEFAULT '',
    file TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    diff TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_project_sessions_project ON public.project_sessions(project_id, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_project ON public.session_events(project_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON public.session_events(session_id, user_id, at);

-- Same as the rest of the team tables (see schema.sql): no row-level security, so teammates can read each other's rows.
-- NOTE: with RLS off, anyone holding the project's anon key can read these rows, including the diffs.
ALTER TABLE public.project_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events DISABLE ROW LEVEL SECURITY;

-- Lessons are saved to cue_cards. If saving lessons fails with "row-level security policy",
-- also run:  ALTER TABLE public.cue_cards DISABLE ROW LEVEL SECURITY;
