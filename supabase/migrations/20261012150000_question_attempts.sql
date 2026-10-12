-- Ranking v2, phase 1: record every answered question (Ian's ranking build plan, 2026-10-10).
--
-- Practice has only ever stored a tally (practice_sessions), so mastery, repeats and the new streak rule had nothing
-- to compute from. This adds one row per answered question, written only by security-definer functions, and a new
-- practice entry point that sends the student's CHOICES and grades them here against the key.
--
-- XP is unchanged in this phase: record_practice_answers pays exactly what record_practice_session pays today
-- (xp_for_practice on the server-graded count). record_practice_session stays for the flag-off app path.

CREATE TABLE IF NOT EXISTS public.question_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_ids  UUID[] NOT NULL,                       -- what the student chose (one for MCQ, several for SATA)
  domain_id   INT REFERENCES public.domains(id),    -- the question's domain at the time it was answered
  is_correct  BOOLEAN NOT NULL,                      -- graded on the server, never taken from the client
  source      TEXT NOT NULL CHECK (source IN ('practice', 'mock', 'promotion')),
  session_id  UUID,                                  -- practice_sessions / mock_exam_sessions / promotion_attempts id
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_user_domain_time ON public.question_attempts (user_id, domain_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_user_question_time ON public.question_attempts (user_id, question_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_session ON public.question_attempts (session_id);

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;

-- Students read their own answers; staff read everyone's. No insert/update/delete policies: rows are written only by
-- the security-definer functions below, so nobody can add, edit or remove an attempt directly.
DROP POLICY IF EXISTS "question_attempts: own or staff read" ON public.question_attempts;
CREATE POLICY "question_attempts: own or staff read"
  ON public.question_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());

-- ─────────────────────────────────────────────────────────────────────────────
-- Practice: the client sends the questions it showed and the options chosen; the server grades.
--   p_answers: [{"question_id": "<uuid>", "option_ids": ["<uuid>", ...]}, ...]
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_practice_answers(p_answers JSONB, p_domain INT DEFAULT NULL)
RETURNS public.practice_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_total   INT;
  n_correct INT;
  row       public.practice_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be a list' USING ERRCODE = '22023';
  END IF;
  n_total := jsonb_array_length(p_answers);
  IF n_total < 1 OR n_total > 200 THEN
    RAISE EXCEPTION 'implausible session length' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _ans, _graded;
  CREATE TEMP TABLE _ans ON COMMIT DROP AS
  SELECT (a->>'question_id')::uuid AS question_id,
         ARRAY(SELECT jsonb_array_elements_text(a->'option_ids'))::uuid[] AS option_ids
    FROM jsonb_array_elements(p_answers) a;

  IF (SELECT COUNT(DISTINCT question_id) FROM _ans) <> n_total THEN
    RAISE EXCEPTION 'each question may be answered once per session' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM _ans WHERE question_id IS NULL OR cardinality(option_ids) = 0) THEN
    RAISE EXCEPTION 'every answer needs a question and at least one option' USING ERRCODE = '22023';
  END IF;
  -- Only live practice questions (what fetchQuizQuestions serves) can be answered.
  IF EXISTS (SELECT 1 FROM _ans x LEFT JOIN public.questions q ON q.id = x.question_id
              WHERE q.id IS NULL OR NOT q.is_active OR q.context <> 'standalone') THEN
    RAISE EXCEPTION 'unknown or inactive question' USING ERRCODE = '22023';
  END IF;
  -- Every chosen option must belong to its question.
  IF EXISTS (SELECT 1 FROM _ans x, unnest(x.option_ids) oid
              WHERE NOT EXISTS (SELECT 1 FROM public.question_options o WHERE o.id = oid AND o.question_id = x.question_id)) THEN
    RAISE EXCEPTION 'an option does not belong to its question' USING ERRCODE = '22023';
  END IF;

  -- Grade: correct when the chosen set equals the keyed set (one option for MCQ, all of them for SATA).
  CREATE TEMP TABLE _graded ON COMMIT DROP AS
  SELECT x.question_id, x.option_ids, q.domain_id,
         (SELECT array_agg(o.id ORDER BY o.id) FROM public.question_options o WHERE o.question_id = x.question_id AND o.is_correct)
           = (SELECT array_agg(DISTINCT c ORDER BY c) FROM unnest(x.option_ids) c) AS is_correct
    FROM _ans x JOIN public.questions q ON q.id = x.question_id;

  SELECT COUNT(*) FILTER (WHERE is_correct) INTO n_correct FROM _graded;

  INSERT INTO public.practice_sessions (student_id, total_answered, correct_count, domain_id)
  VALUES (auth.uid(), n_total, n_correct, p_domain)
  RETURNING * INTO row;

  INSERT INTO public.question_attempts (user_id, question_id, option_ids, domain_id, is_correct, source, session_id)
  SELECT auth.uid(), question_id, option_ids, domain_id, COALESCE(is_correct, false), 'practice', row.id FROM _graded;

  -- Phase 1 pays exactly today's banded amount; the weighted rules arrive in phase 2.
  PERFORM public.award_xp(auth.uid(), public.xp_for_practice(n_total), 'practice_session', row.id);
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_practice_answers(JSONB, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_practice_answers(JSONB, INT) TO authenticated;
