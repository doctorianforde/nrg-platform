-- Case study platform (Jade's V3 case standard). Plan: docs/phase-1/CASE_STUDY_PLAN.md.
-- Unfolding cases: opening scenario + timed stages, Q1-Q6 in clinical-judgment order (+ optional Q7-Q8),
-- answers locked per question, results and rationales only after the case is complete, standard/premium tiers only.

-- ── Questions that live inside a case never appear in practice, flashcards or mock-exam pools ──
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'standalone'
  CONSTRAINT questions_context_check CHECK (context IN ('standalone','case'));
CREATE INDEX IF NOT EXISTS questions_context_idx ON public.questions (context);

-- Case items may use an "unsafe" option type (V3 s.9); the standalone bank keeps one-of-each.
ALTER TABLE public.question_options DROP CONSTRAINT IF EXISTS question_options_distractor_type_check;
ALTER TABLE public.question_options ADD CONSTRAINT question_options_distractor_type_check
  CHECK (distractor_type IS NULL OR distractor_type IN ('correct','close','priority','incorrect','not_asked','unsafe'));

-- ── Case header ──
ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS case_code text,
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS population text,
  ADD COLUMN IF NOT EXISTS setting text,
  ADD COLUMN IF NOT EXISTS primary_condition text,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS pathophysiology text,
  ADD COLUMN IF NOT EXISTS quality_report text,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_note text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.case_studies
  ADD CONSTRAINT case_studies_status_check CHECK (status IN ('draft','in_review','approved','archived')),
  ADD CONSTRAINT case_studies_difficulty_check CHECK (difficulty IS NULL OR difficulty IN ('low','moderate','high')),
  ADD CONSTRAINT case_studies_validation_check CHECK (validation_status IN ('pending','validated')),
  -- V3 s.14: nothing reaches students without clinical validation.
  ADD CONSTRAINT case_studies_publish_requires_validation CHECK (NOT is_active OR (status = 'approved' AND validation_status = 'validated'));
CREATE UNIQUE INDEX IF NOT EXISTS case_studies_case_code_key ON public.case_studies (case_code);
COMMENT ON COLUMN public.case_studies.clinical_scenario IS 'Opening scenario (baseline). Later information lives in case_stages.';

-- ── Stages: NEW INFORMATION blocks, in order. stage_order 0 = opening assessment shown with the baseline. ──
CREATE TABLE IF NOT EXISTS public.case_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id uuid NOT NULL REFERENCES public.case_studies(id) ON DELETE CASCADE,
  stage_order smallint NOT NULL,
  time_label text NOT NULL,
  narrative text NOT NULL DEFAULT '',
  vitals jsonb NOT NULL DEFAULT '[]',      -- [{label, value}] in display order, never flagged
  assessment jsonb NOT NULL DEFAULT '[]',  -- [{system, finding}] in body-systems order
  labs jsonb NOT NULL DEFAULT '[]',        -- [{category, items: [{label, value}]}]
  UNIQUE (case_study_id, stage_order)
);
ALTER TABLE public.case_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_stages: authenticated read" ON public.case_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_stages: admin write" ON public.case_stages FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── Case questions: position in the case, the stage they follow, clinical-judgment step, V3 s.16 metadata ──
ALTER TABLE public.case_study_questions
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.case_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cj_step text,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.case_study_questions
  ADD CONSTRAINT case_study_questions_cj_step_check CHECK (cj_step IS NULL OR cj_step IN
    ('recognize_cues','analyze_cues','prioritize_hypotheses','generate_solutions','take_action','evaluate_outcomes','extension'));
CREATE UNIQUE INDEX IF NOT EXISTS case_study_questions_position_key ON public.case_study_questions (case_study_id, display_order);

-- ── Attempts ──
CREATE TABLE IF NOT EXISTS public.case_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_study_id uuid NOT NULL REFERENCES public.case_studies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  next_position smallint NOT NULL DEFAULT 1,  -- display_order of the next unanswered question
  total_questions smallint NOT NULL,
  correct_count smallint,
  score_pct numeric(5,2)
);
CREATE UNIQUE INDEX IF NOT EXISTS case_attempts_one_open ON public.case_attempts (student_id, case_study_id) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.case_attempt_responses (
  attempt_id uuid NOT NULL REFERENCES public.case_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id uuid NOT NULL REFERENCES public.question_options(id),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

ALTER TABLE public.case_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_attempt_responses ENABLE ROW LEVEL SECURITY;
-- Students read their own; staff read all. All writes go through the functions below (no insert/update policies),
-- which is what makes answers lock: once recorded, a response cannot be changed.
CREATE POLICY "case_attempts: own or staff read" ON public.case_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.user_role() IN ('teacher','admin','super_admin'));
CREATE POLICY "case_attempt_responses: own or staff read" ON public.case_attempt_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.case_attempts a WHERE a.id = attempt_id AND a.student_id = auth.uid())
         OR public.user_role() IN ('teacher','admin','super_admin'));
CREATE POLICY "case_attempts: admin delete" ON public.case_attempts FOR DELETE TO authenticated USING (public.is_admin());

-- Start (or resume) an attempt. Paid tiers only; staff may always.
CREATE OR REPLACE FUNCTION public.start_case_attempt(p_case_id uuid)
RETURNS public.case_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prof public.profiles;
  cs public.case_studies;
  att public.case_attempts;
  n int;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid();
  IF prof.id IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF prof.role = 'student' AND prof.subscription_tier NOT IN ('standard','premium') THEN
    RAISE EXCEPTION 'case studies need a standard or premium plan' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cs FROM public.case_studies WHERE id = p_case_id;
  IF cs.id IS NULL OR NOT cs.is_active THEN
    IF NOT (prof.role IN ('teacher','admin','super_admin') AND cs.id IS NOT NULL) THEN
      RAISE EXCEPTION 'case not available' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  SELECT * INTO att FROM public.case_attempts WHERE student_id = prof.id AND case_study_id = p_case_id AND completed_at IS NULL;
  IF att.id IS NOT NULL THEN RETURN att; END IF;
  SELECT count(*) INTO n FROM public.case_study_questions WHERE case_study_id = p_case_id;
  IF n = 0 THEN RAISE EXCEPTION 'case has no questions' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.case_attempts (student_id, case_study_id, total_questions, next_position)
  VALUES (prof.id, p_case_id, n, (SELECT min(display_order) FROM public.case_study_questions WHERE case_study_id = p_case_id))
  RETURNING * INTO att;
  RETURN att;
END;
$$;

-- Answer the next question in order. Grades server-side, locks the answer, advances, and closes the attempt after the last one.
CREATE OR REPLACE FUNCTION public.answer_case_question(p_attempt_id uuid, p_option_id uuid)
RETURNS public.case_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  att public.case_attempts;
  qid uuid;
  ok boolean;
  nxt smallint;
BEGIN
  SELECT * INTO att FROM public.case_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF att.id IS NULL OR att.student_id <> auth.uid() THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE = '42501'; END IF;
  IF att.completed_at IS NOT NULL THEN RAISE EXCEPTION 'this case is already complete' USING ERRCODE = '22023'; END IF;
  SELECT question_id INTO qid FROM public.case_study_questions
   WHERE case_study_id = att.case_study_id AND display_order = att.next_position;
  SELECT o.is_correct INTO ok FROM public.question_options o WHERE o.id = p_option_id AND o.question_id = qid;
  IF ok IS NULL THEN RAISE EXCEPTION 'that option is not part of the current question' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.case_attempt_responses (attempt_id, question_id, selected_option_id, is_correct)
  VALUES (att.id, qid, p_option_id, ok);
  SELECT min(display_order) INTO nxt FROM public.case_study_questions
   WHERE case_study_id = att.case_study_id AND display_order > att.next_position;
  IF nxt IS NULL THEN
    UPDATE public.case_attempts SET
      next_position = att.next_position + 1,
      completed_at = now(),
      correct_count = (SELECT count(*) FROM public.case_attempt_responses WHERE attempt_id = att.id AND is_correct),
      score_pct = round(100.0 * (SELECT count(*) FROM public.case_attempt_responses WHERE attempt_id = att.id AND is_correct) / att.total_questions, 2)
    WHERE id = att.id RETURNING * INTO att;
  ELSE
    UPDATE public.case_attempts SET next_position = nxt WHERE id = att.id RETURNING * INTO att;
  END IF;
  RETURN att;
END;
$$;

REVOKE ALL ON FUNCTION public.start_case_attempt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.answer_case_question(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_case_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_case_question(uuid, uuid) TO authenticated;

-- Staff manage case status and validation; teachers may move cases through review, admins may do everything (existing admin write policy).
CREATE POLICY "case_studies: teacher review update" ON public.case_studies FOR UPDATE TO authenticated
  USING (public.user_role() = 'teacher') WITH CHECK (public.user_role() = 'teacher');
