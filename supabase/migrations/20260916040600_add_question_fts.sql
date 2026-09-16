-- T38: Full-text search over questions + search_mock_exam_questions()
-- Lets a student keyword-search the questions from their own past mock exams.

-- 1. Generated tsvector column (body + explanation) on questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(body, '') || ' ' || coalesce(explanation, ''))
  ) STORED;

-- 2. GIN index
CREATE INDEX IF NOT EXISTS idx_questions_fts ON public.questions USING GIN (fts);

-- 3. Search scoped to a student's own session history.
--    SECURITY DEFINER so it can join freely; the guard below stops a student
--    passing someone else's id. Teachers/admins may search any student.
--    Never returns explanation — rationale gating stays at the app layer.
CREATE OR REPLACE FUNCTION public.search_mock_exam_questions(
  p_student_id UUID,
  p_query      TEXT
)
RETURNS TABLE (
  session_id   UUID,
  set_title    TEXT,
  completed_at TIMESTAMPTZ,
  question_id  UUID,
  body         TEXT,
  is_correct   BOOLEAN,
  rank         REAL
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND p_student_id <> auth.uid()
     AND public.user_role() NOT IN ('teacher','admin','super_admin') THEN
    RAISE EXCEPTION 'may only search your own exam history' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.session_id, ms.title, ses.completed_at,
         q.id, q.body, r.is_correct,
         ts_rank(q.fts, websearch_to_tsquery('english', p_query))
  FROM   public.mock_exam_responses r
  JOIN   public.mock_exam_sessions  ses ON ses.id = r.session_id
  JOIN   public.mock_exam_sets      ms  ON ms.id  = ses.set_id
  JOIN   public.questions           q   ON q.id   = r.question_id
  WHERE  ses.student_id = p_student_id
    AND  q.fts @@ websearch_to_tsquery('english', p_query)
  ORDER BY 7 DESC, ses.completed_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_mock_exam_questions(UUID, TEXT) TO authenticated;
