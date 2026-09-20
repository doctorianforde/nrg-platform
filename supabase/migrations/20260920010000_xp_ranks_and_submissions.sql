-- Levelling: XP, ranks, student question submissions, practice tracking.
--
-- Ranks follow Patricia Benner's "From Novice to Expert" stages, the standard
-- nursing competency progression — the right vocabulary for this audience, and
-- exactly the range the brief asked for.
--
-- XP is an append-only ledger rather than a running total on profiles. A ledger
-- gives a student the "where did this come from" breakdown, makes the total
-- recomputable if the weights ever change, and lets a UNIQUE index make every award
-- idempotent — a question approved, un-approved and re-approved pays once.

CREATE TABLE IF NOT EXISTS public.xp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     INT  NOT NULL CHECK (amount > 0 AND amount <= 10000),
  reason     TEXT NOT NULL CHECK (reason IN ('mock_exam','question_approved','practice_session')),
  -- What earned it: a session id, a question id. Kept for provenance and dedupe.
  source_id  UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_user ON public.xp_events(user_id, created_at DESC);
-- One award per thing, whatever route the award takes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_once
  ON public.xp_events(reason, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_events: own or staff read"
  ON public.xp_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());
-- No INSERT/UPDATE/DELETE policy: XP is only ever written by the award functions
-- below, which run as SECURITY DEFINER. Nobody can grant themselves XP.
REVOKE ALL ON public.xp_events FROM anon, authenticated;
GRANT SELECT ON public.xp_events TO authenticated;

-- Practice sessions were not recorded at all before this. Small table, but it also
-- finally gives a picture of how students actually study.
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_answered INT  NOT NULL CHECK (total_answered >= 0),
  correct_count  INT  NOT NULL CHECK (correct_count >= 0),
  domain_id      INT  REFERENCES public.domains(id),
  finished_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT practice_correct_within_total CHECK (correct_count <= total_answered)
);
CREATE INDEX IF NOT EXISTS idx_ps_student ON public.practice_sessions(student_id, finished_at DESC);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "practice_sessions: own or staff read"
  ON public.practice_sessions FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_teaching_staff());
REVOKE ALL ON public.practice_sessions FROM anon, authenticated;
GRANT SELECT ON public.practice_sessions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Weights and ranks, in one place
-- ─────────────────────────────────────────────────────────────────────────────
-- Mock exam: a flat award plus the score, so 100 + 72 for a 72% paper. Sitting a
--   full paper is the biggest single commitment, and doing well pays more.
-- Approved question: the largest flat award — writing a defensible item with
--   rationales is real work, and it only pays once a teacher has approved it.
-- Practice session: deliberately small, and scaled by length so a one-question
--   session cannot be farmed.
CREATE OR REPLACE FUNCTION public.xp_for_mock_exam(p_score NUMERIC)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT 100 + GREATEST(0, LEAST(100, COALESCE(round(p_score), 0)))::INT
$$;

CREATE OR REPLACE FUNCTION public.xp_for_practice(p_answered INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(1, LEAST(25, COALESCE(p_answered, 0)))::INT
$$;

CREATE OR REPLACE FUNCTION public.xp_for_approved_question()
RETURNS INT LANGUAGE sql IMMUTABLE AS $$ SELECT 150 $$;

CREATE OR REPLACE FUNCTION public.xp_total(p_user UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)::INT FROM public.xp_events WHERE user_id = p_user
$$;

REVOKE ALL ON FUNCTION public.xp_total(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xp_total(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Awarding
-- ─────────────────────────────────────────────────────────────────────────────

-- XP is a student progression, so staff accounts never accrue it.
CREATE OR REPLACE FUNCTION public.award_xp(
  p_user UUID, p_amount INT, p_reason TEXT, p_source UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RETURN; END IF;
  IF public.is_staff(p_user) THEN RETURN; END IF;

  INSERT INTO public.xp_events (user_id, amount, reason, source_id)
  VALUES (p_user, p_amount, p_reason, p_source)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.award_xp(UUID, INT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Approving a student's submission pays its author. Fires on the transition only,
-- so the questions already sitting at 'approved' award nothing retroactively, and
-- an AI question (created_by IS NULL) never pays anyone.
CREATE OR REPLACE FUNCTION public.award_question_xp()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.review_status = 'approved'
     AND COALESCE(OLD.review_status, '') <> 'approved'
     AND NEW.created_by IS NOT NULL THEN
    PERFORM public.award_xp(
      NEW.created_by, public.xp_for_approved_question(), 'question_approved', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_award_question_xp
  AFTER UPDATE OF review_status ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.award_question_xp();

-- Finishing a mock exam. Replaces T37's version, adding only the award.
CREATE OR REPLACE FUNCTION public.complete_mock_exam_session(p_session_id UUID)
RETURNS public.mock_exam_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess public.mock_exam_sessions;
  total INT;
  correct INT;
BEGIN
  SELECT * INTO sess FROM public.mock_exam_sessions WHERE id = p_session_id;
  IF sess.id IS NULL THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND sess.student_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not your session' USING ERRCODE = '42501';
  END IF;
  IF sess.completed_at IS NOT NULL THEN
    RETURN sess;
  END IF;

  SELECT count(*) INTO total FROM public.mock_exam_set_questions WHERE set_id = sess.set_id;
  SELECT count(*) INTO correct FROM public.mock_exam_responses
   WHERE session_id = p_session_id AND is_correct;

  UPDATE public.mock_exam_sessions
     SET completed_at    = now(),
         total_questions = total,
         correct_count   = correct,
         score_pct       = CASE WHEN total = 0 THEN 0
                                ELSE round(correct::numeric * 100 / total, 2) END
   WHERE id = p_session_id
   RETURNING * INTO sess;

  PERFORM public.award_xp(
    sess.student_id, public.xp_for_mock_exam(sess.score_pct), 'mock_exam', sess.id
  );
  RETURN sess;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_mock_exam_session(UUID) TO authenticated;

-- Recording a finished practice run. The client reports its tally; the server
-- decides the XP, and a student can only ever record a session for themselves.
CREATE OR REPLACE FUNCTION public.record_practice_session(
  p_total INT, p_correct INT, p_domain INT DEFAULT NULL
)
RETURNS public.practice_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.practice_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_total IS NULL OR p_total < 1 OR p_total > 200 THEN
    RAISE EXCEPTION 'implausible session length' USING ERRCODE = '22023';
  END IF;
  IF p_correct IS NULL OR p_correct < 0 OR p_correct > p_total THEN
    RAISE EXCEPTION 'correct count outside the session' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.practice_sessions (student_id, total_answered, correct_count, domain_id)
  VALUES (auth.uid(), p_total, p_correct, p_domain)
  RETURNING * INTO row;

  PERFORM public.award_xp(
    auth.uid(), public.xp_for_practice(p_total), 'practice_session', row.id
  );
  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.record_practice_session(INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_practice_session(INT, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Student question submissions
-- ─────────────────────────------------------------------------------------------
-- Students may now author a question, but only as an unapproved, inactive draft
-- attributed to themselves. Everything else about a question stays teacher-only.
DROP POLICY IF EXISTS "questions: teacher+ insert" ON public.questions;

CREATE POLICY "questions: teacher insert, student submits a draft"
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.user_role() = 'teacher' AND created_by = auth.uid())
    OR (
      public.user_role() = 'student'
      AND created_by = auth.uid()
      AND review_status = 'pending'
      AND is_active = false
      AND is_ai_generated = false
    )
  );

-- A student may keep editing their own draft until it is decided, which also lets
-- them attach the options. Once approved or rejected it is out of their hands.
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
      OR (public.user_role() = 'student'
          AND EXISTS (SELECT 1 FROM public.questions q
                      WHERE q.id = q_id
                        AND q.created_by = auth.uid()
                        AND q.review_status = 'pending'
                        AND q.is_active = false))
$$;

-- A student must never be able to promote their own draft.
CREATE OR REPLACE FUNCTION public.protect_question_review_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_teaching_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.review_status IS DISTINCT FROM OLD.review_status
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'only teaching staff may review a question'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_protect_question_review
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.protect_question_review_columns();
