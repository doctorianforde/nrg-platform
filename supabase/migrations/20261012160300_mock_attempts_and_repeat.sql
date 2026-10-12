-- Ranking v2, phase 2d: mock exams feed question_attempts (for mastery and the streak), and a retaken set pays less.
--
-- Topic multipliers never apply to mocks (Jade): a mock pays its flat award. The repeat rule does (Ian, "Less"): a set
-- the student already completed in the last repeat_days pays mock_repeat_factor of its award. In shadow mode the full
-- award is paid as today and the repeat-adjusted amount is logged to xp_shadow.
-- Replaces the 20260920060000 version; everything before the award is unchanged.

CREATE OR REPLACE FUNCTION public.complete_mock_exam_session(p_session_id UUID)
RETURNS public.mock_exam_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess    public.mock_exam_sessions;
  total   INT;
  correct INT;
  expired BOOLEAN;
  live    BOOLEAN;
  old_amt INT;
  new_amt INT;
  retake  BOOLEAN;
  domains INT[];
BEGIN
  SELECT * INTO sess FROM public.mock_exam_sessions WHERE id = p_session_id;
  IF sess.id IS NULL THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  expired := sess.expires_at IS NOT NULL AND now() > sess.expires_at;

  IF auth.uid() IS NOT NULL
     AND sess.student_id <> auth.uid()
     AND NOT public.is_admin()
     AND NOT expired THEN
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

  -- Every answered mock question becomes an attempt (graded already by trg_grade_mock_exam_response). No xp_weight:
  -- mocks are not weighted.
  INSERT INTO public.question_attempts (user_id, question_id, option_ids, domain_id, is_correct, source, session_id, answered_at)
  SELECT sess.student_id, r.question_id, COALESCE(r.selected_option_ids, '{}'), q.domain_id, COALESCE(r.is_correct, false),
         'mock', sess.id, COALESCE(r.answered_at, now())
    FROM public.mock_exam_responses r JOIN public.questions q ON q.id = r.question_id
   WHERE r.session_id = sess.id AND cardinality(COALESCE(r.selected_option_ids, '{}')) > 0;

  live := public.rcfg('rules_live') = 1;
  old_amt := public.xp_for_mock_exam(sess.score_pct);
  retake := EXISTS (SELECT 1 FROM public.mock_exam_sessions o
                     WHERE o.student_id = sess.student_id AND o.set_id = sess.set_id AND o.id <> sess.id
                       AND o.completed_at IS NOT NULL
                       AND o.completed_at > now() - make_interval(days => public.rcfg('repeat_days')::int));
  new_amt := CASE WHEN retake THEN GREATEST(1, round(old_amt * public.rcfg('mock_repeat_factor')))::int ELSE old_amt END;

  IF live THEN
    PERFORM public.award_xp_detail(sess.student_id, new_amt, 'mock_exam', sess.id,
      jsonb_build_object('base', old_amt, 'retake', retake));
  ELSE
    PERFORM public.award_xp(sess.student_id, old_amt, 'mock_exam', sess.id);
    IF NOT public.is_staff(sess.student_id) THEN
      INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
      VALUES (sess.student_id, 'mock', sess.id, old_amt, new_amt, jsonb_build_object('retake', retake))
      ON CONFLICT (kind, source_id) DO NOTHING;
    END IF;
  END IF;

  SELECT array_agg(DISTINCT q.domain_id) INTO domains
    FROM public.mock_exam_responses r JOIN public.questions q ON q.id = r.question_id
   WHERE r.session_id = sess.id AND q.domain_id IS NOT NULL;
  PERFORM public.apply_answer_bonuses(sess.student_id, domains, live);
  RETURN sess;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_mock_exam_session(UUID) TO authenticated;
