-- Question review workflow: lets teachers (Jade) evaluate the 2,000 AI-generated questions.
--
-- 1. Review state on public.questions. is_active alone cannot tell "not yet reviewed"
--    from "reviewed and rejected", so review_status is tracked separately.
-- 2. Safety net: an AI-generated question can only be live (is_active) once approved.
-- 3. can_manage_question(): teachers may also edit AI-generated questions (previously
--    teachers could only edit rows they created, and AI rows have created_by = NULL).
--    Human-authored client questions (Jade's 100) stay admin-only for teachers.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT questions_review_status_check
    CHECK (review_status IN ('pending','approved','needs_changes','rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Human-authored questions were never part of the review queue.
UPDATE public.questions SET review_status = 'approved' WHERE is_ai_generated = false;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_ai_active_requires_approval
  CHECK (NOT (is_ai_generated AND is_active AND review_status <> 'approved'));

CREATE INDEX IF NOT EXISTS idx_q_review_status ON public.questions(review_status) WHERE is_ai_generated;

CREATE OR REPLACE FUNCTION public.can_manage_question(q_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (public.user_role() = 'teacher'
          AND EXISTS (SELECT 1 FROM public.questions q
                      WHERE q.id = q_id
                        AND (q.created_by = auth.uid() OR q.is_ai_generated)))
$$;
