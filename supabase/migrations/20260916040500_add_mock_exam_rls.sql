-- T37: RLS + rationale-gate policies for mock exam tables
-- Uses public.user_role() / public.is_admin() (T11 / T12).

ALTER TABLE public.mock_exam_sets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_exam_set_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_exam_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_exam_responses     ENABLE ROW LEVEL SECURITY;

-- ── mock_exam_sets ───────────────────────────────────────────────────────────
CREATE POLICY "mock_exam_sets: authenticated read"
  ON public.mock_exam_sets FOR SELECT TO authenticated USING (true);

CREATE POLICY "mock_exam_sets: teacher+ insert"
  ON public.mock_exam_sets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.user_role() = 'teacher' AND created_by = auth.uid())
  );

-- Teachers update their own sets (this is where rationale_released_at is set);
-- admins update any. Students have no UPDATE path at all → cannot release rationale.
CREATE POLICY "mock_exam_sets: teacher own or admin any update"
  ON public.mock_exam_sets FOR UPDATE TO authenticated
  USING      (public.is_admin() OR (public.user_role() = 'teacher' AND created_by = auth.uid()))
  WITH CHECK (public.is_admin() OR (public.user_role() = 'teacher' AND created_by = auth.uid()));

CREATE POLICY "mock_exam_sets: admin delete"
  ON public.mock_exam_sets FOR DELETE TO authenticated
  USING (public.is_admin());

-- Audit: stamp who released the rationale, and make release a one-way switch
-- for teachers (only admins can re-lock).
CREATE OR REPLACE FUNCTION public.stamp_rationale_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rationale_released_at IS DISTINCT FROM OLD.rationale_released_at THEN
    IF NEW.rationale_released_at IS NULL AND NOT public.is_admin() AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'only an admin may re-lock rationale' USING ERRCODE = '42501';
    END IF;
    NEW.rationale_released_by := CASE WHEN NEW.rationale_released_at IS NULL
                                      THEN NULL ELSE COALESCE(auth.uid(), NEW.rationale_released_by) END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_stamp_rationale_release
  BEFORE UPDATE OF rationale_released_at ON public.mock_exam_sets
  FOR EACH ROW EXECUTE FUNCTION public.stamp_rationale_release();

-- ── mock_exam_set_questions ─────────────────────────────────────────────────
CREATE POLICY "mock_exam_set_questions: authenticated read"
  ON public.mock_exam_set_questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "mock_exam_set_questions: follow parent set"
  ON public.mock_exam_set_questions FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.mock_exam_sets s
               WHERE s.id = set_id AND s.created_by = auth.uid()
                 AND public.user_role() = 'teacher')
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.mock_exam_sets s
               WHERE s.id = set_id AND s.created_by = auth.uid()
                 AND public.user_role() = 'teacher')
  );

-- ── mock_exam_sessions ──────────────────────────────────────────────────────
CREATE POLICY "mock_exam_sessions: own or teacher+ read"
  ON public.mock_exam_sessions FOR SELECT TO authenticated
  USING (student_id = auth.uid()
         OR public.user_role() IN ('teacher','admin','super_admin'));

CREATE POLICY "mock_exam_sessions: student insert own"
  ON public.mock_exam_sessions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() OR public.is_admin());

CREATE POLICY "mock_exam_sessions: student update own, admin any"
  ON public.mock_exam_sessions FOR UPDATE TO authenticated
  USING      (student_id = auth.uid() OR public.is_admin())
  WITH CHECK (student_id = auth.uid() OR public.is_admin());

CREATE POLICY "mock_exam_sessions: admin delete"
  ON public.mock_exam_sessions FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── mock_exam_responses ─────────────────────────────────────────────────────
CREATE POLICY "mock_exam_responses: own or teacher+ read"
  ON public.mock_exam_responses FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.mock_exam_sessions s
            WHERE s.id = session_id AND s.student_id = auth.uid())
    OR public.user_role() IN ('teacher','admin','super_admin')
  );

-- A student may only answer within their own, still-open session.
CREATE POLICY "mock_exam_responses: student insert own open session"
  ON public.mock_exam_responses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.mock_exam_sessions s
               WHERE s.id = session_id AND s.student_id = auth.uid()
                 AND s.completed_at IS NULL)
  );

CREATE POLICY "mock_exam_responses: student update own open session"
  ON public.mock_exam_responses FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.mock_exam_sessions s
               WHERE s.id = session_id AND s.student_id = auth.uid()
                 AND s.completed_at IS NULL)
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.mock_exam_sessions s
               WHERE s.id = session_id AND s.student_id = auth.uid()
                 AND s.completed_at IS NULL)
  );

CREATE POLICY "mock_exam_responses: admin delete"
  ON public.mock_exam_responses FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── Scoring: finish a session server-side ───────────────────────────────────
-- Called by the app when the student submits. Computes score from graded
-- responses and stamps completed_at. Only the session owner (or admin) may call it.
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
  RETURN sess;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_mock_exam_session(UUID) TO authenticated;
