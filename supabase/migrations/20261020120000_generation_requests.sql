-- Generation requests: the queue between the teacher UI (Jade asks for content) and whatever runs the generators
-- (a Claude Code / Kimi agent session or the CLI today; a server worker later). One row per request.
--
--   request   the full GenerationRequest JSON (src/lib/generation/request.ts): kind, mode (auto | prompted),
--             count, selections (domain / taxonomy / cluster / topic / difficulty, or the case equivalents),
--             Jade's prompt, and the interpretation he confirmed.
--   status    draft → awaiting_confirmation (prompted: interpretation shown, not yet accepted) → queued
--             → running → done | failed;  cancelled from any pre-running state.
--   result    filled by the runner: run id, output file, item / case counts, failures.
--
-- Teaching staff (teacher, admin, super_admin) read every request and create and edit their own until it starts
-- running. Only the runner (service role) moves a request to running / done / failed or writes result and error.
-- Students and anon have no access. Generated content still lands as pending review (is_active=false); nothing
-- here publishes anything.
--
-- ROLLBACK: DROP TABLE public.generation_requests;

CREATE TABLE IF NOT EXISTS public.generation_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('mcq', 'case_study')),
  mode          TEXT NOT NULL CHECK (mode IN ('auto', 'prompted')),
  request       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'awaiting_confirmation', 'queued', 'running', 'done', 'failed', 'cancelled')),
  requested_by  UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  CONSTRAINT generation_requests_kind_matches CHECK (request->>'kind' = kind AND request->>'mode' = mode)
);
CREATE INDEX IF NOT EXISTS idx_generation_requests_status ON public.generation_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_generation_requests_by ON public.generation_requests(requested_by, created_at DESC);

CREATE OR REPLACE TRIGGER trg_generation_requests_updated_at
  BEFORE UPDATE ON public.generation_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.generation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generation_requests: staff read"
  ON public.generation_requests FOR SELECT TO authenticated
  USING (public.is_teaching_staff());

CREATE POLICY "generation_requests: staff create own"
  ON public.generation_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_teaching_staff() AND requested_by = auth.uid()
              AND status IN ('draft', 'awaiting_confirmation', 'queued')
              AND result IS NULL AND error IS NULL AND started_at IS NULL AND finished_at IS NULL);

CREATE POLICY "generation_requests: staff edit own before it runs"
  ON public.generation_requests FOR UPDATE TO authenticated
  USING (public.is_teaching_staff() AND requested_by = auth.uid()
         AND status IN ('draft', 'awaiting_confirmation', 'queued'))
  WITH CHECK (public.is_teaching_staff() AND requested_by = auth.uid()
              AND status IN ('draft', 'awaiting_confirmation', 'queued', 'cancelled')
              AND result IS NULL AND error IS NULL AND started_at IS NULL AND finished_at IS NULL);

-- Grants: no anon access at all; authenticated gets exactly the verbs the policies above cover (no DELETE).
REVOKE ALL ON public.generation_requests FROM anon;
REVOKE ALL ON public.generation_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.generation_requests TO authenticated;
