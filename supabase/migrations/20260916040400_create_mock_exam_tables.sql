-- T36: Mock exam tables (Track D — client addendum)
--
-- Business rules (from client):
--   1. Mock exams run in real exam format — no rationale shown during the exam.
--   2. Student gets a score at the end.
--   3. Rationale is WITHHELD until a teacher explicitly releases it after class review.
--   4. Release is a deliberate teacher-triggered event — never automatic/time-based.
--   5. Every session is recorded so students and teachers can review it later.
--
-- Rationale gating is enforced at the APP LAYER: the Next.js API only includes
-- questions.explanation / question_options.rationale when
-- mock_exam_sets.rationale_released_at IS NOT NULL. The DB enforces WHO may set
-- that column (teacher/admin — see T37 RLS).

-- One set = one exam's question pool + its rationale-release switch
CREATE TABLE IF NOT EXISTS public.mock_exam_sets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  description           TEXT,
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  -- NULL = rationale locked; non-NULL = released at this timestamp
  rationale_released_at TIMESTAMPTZ,
  rationale_released_by UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mes_created_by ON public.mock_exam_sets(created_by);
CREATE INDEX IF NOT EXISTS idx_mes_active     ON public.mock_exam_sets(is_active);

-- Which questions belong to a set, in what order
CREATE TABLE IF NOT EXISTS public.mock_exam_set_questions (
  set_id        UUID NOT NULL REFERENCES public.mock_exam_sets(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES public.questions(id),
  display_order INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_mesq_question ON public.mock_exam_set_questions(question_id);

-- One row per student attempt
CREATE TABLE IF NOT EXISTS public.mock_exam_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES auth.users(id),
  set_id          UUID NOT NULL REFERENCES public.mock_exam_sets(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  score_pct       NUMERIC(5,2),
  total_questions INT,
  correct_count   INT
);
CREATE INDEX IF NOT EXISTS idx_meses_student ON public.mock_exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_meses_set     ON public.mock_exam_sessions(set_id);

-- Per-question answers. SATA supported via UUID[] of selected option ids.
CREATE TABLE IF NOT EXISTS public.mock_exam_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES public.mock_exam_sessions(id) ON DELETE CASCADE,
  question_id         UUID NOT NULL REFERENCES public.questions(id),
  selected_option_ids UUID[] NOT NULL DEFAULT '{}',
  is_correct          BOOLEAN,
  answered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_mer_session  ON public.mock_exam_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_mer_question ON public.mock_exam_responses(question_id);

CREATE OR REPLACE TRIGGER trg_mock_exam_sets_updated_at
  BEFORE UPDATE ON public.mock_exam_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grade a response server-side so the client never needs the answer key.
-- Correct = selected set exactly equals the set of is_correct options.
CREATE OR REPLACE FUNCTION public.grade_mock_exam_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  correct_ids UUID[];
BEGIN
  SELECT COALESCE(array_agg(id ORDER BY id), '{}')
    INTO correct_ids
  FROM public.question_options
  WHERE question_id = NEW.question_id AND is_correct;

  -- A question with no correct option is a data error: never grade it correct.
  IF cardinality(correct_ids) = 0 THEN
    NEW.is_correct := false;
    RETURN NEW;
  END IF;

  NEW.is_correct := (
    (SELECT COALESCE(array_agg(x ORDER BY x), '{}')
     FROM unnest(NEW.selected_option_ids) AS x) = correct_ids
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_grade_mock_exam_response
  BEFORE INSERT OR UPDATE OF selected_option_ids ON public.mock_exam_responses
  FOR EACH ROW EXECUTE FUNCTION public.grade_mock_exam_response();
