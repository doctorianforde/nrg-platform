-- Student analytics, private to the student (D8 option 2, decided by Ian 2026-11-09): rank plus their own strengths and
-- weaknesses by domain and taxonomy, per-question counts (grouped into topic reviews by the app), and activity. Never compared with classmates: this function only
-- ever reads the caller's own rows, and returns no cohort figures.
--
-- Read-only and additive: one function, no tables. ROLLBACK: DROP FUNCTION public.my_study_analytics();
--
-- Which answers count: practice and promotion-quiz answers always (practice shows the key at once, and the promotion
-- pool is the practice pool). Mock-exam answers only once the teacher has released that set's rationales: before
-- release the student sees just the score, and a per-topic breakdown could reveal which mock answers were right.
-- Unreleased mock answers are counted separately (`withheld_mock_answers`) so the page can say they are coming.
--
-- Domain state uses the ranking rules' thresholds (rcfg: topic_window, topic_min_answers, weak_max_pct,
-- mastered_min_pct), over the counted answers, so "Weak" / "Mastered" here mean the same as in ranking v2.

CREATE OR REPLACE FUNCTION public.my_study_analytics()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  result JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;

  WITH counted AS (
    SELECT a.question_id, a.domain_id, a.is_correct, a.source, a.answered_at
      FROM public.question_attempts a
      LEFT JOIN public.mock_exam_sessions s ON a.source = 'mock' AND s.id = a.session_id
      LEFT JOIN public.mock_exam_sets st ON st.id = s.set_id
     WHERE a.user_id = uid
       AND (a.source <> 'mock' OR st.rationale_released_at IS NOT NULL)
  ), tagged AS (
    SELECT c.*, q.cognitive_level, q.topic_id
      FROM counted c JOIN public.questions q ON q.id = c.question_id
  ), dom_recent AS (
    SELECT domain_id, is_correct,
           row_number() OVER (PARTITION BY domain_id ORDER BY answered_at DESC) AS rn
      FROM tagged WHERE domain_id IS NOT NULL
  ), dom AS (
    SELECT d.id, d.code, d.name, d.exam_weight_pct, d.display_order,
           count(t.question_id)::int AS answered,
           count(t.question_id) FILTER (WHERE t.is_correct)::int AS correct,
           (SELECT count(*)::int FROM dom_recent r WHERE r.domain_id = d.id AND r.rn <= public.rcfg('topic_window')) AS recent_n,
           (SELECT count(*)::int FROM dom_recent r WHERE r.domain_id = d.id AND r.rn <= public.rcfg('topic_window') AND r.is_correct) AS recent_c
      FROM public.domains d
      LEFT JOIN tagged t ON t.domain_id = d.id
     GROUP BY d.id
  ), tax AS (
    SELECT cognitive_level AS level, count(*)::int AS answered, count(*) FILTER (WHERE is_correct)::int AS correct
      FROM tagged WHERE cognitive_level IS NOT NULL GROUP BY cognitive_level
  ), per_q AS (
    SELECT question_id, count(*)::int AS answered, count(*) FILTER (WHERE is_correct)::int AS correct
      FROM tagged GROUP BY question_id
  ), act AS (
    SELECT public.local_date(answered_at) AS day, count(*)::int AS answered,
           count(*) FILTER (WHERE is_correct)::int AS correct
      FROM tagged
     WHERE answered_at >= now() - interval '120 days'
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'answered', (SELECT count(*) FROM tagged),
    'correct', (SELECT count(*) FILTER (WHERE is_correct) FROM tagged),
    'by_source', COALESCE((SELECT jsonb_object_agg(source, n) FROM (SELECT source, count(*) n FROM tagged GROUP BY source) x), '{}'::jsonb),
    'first_at', (SELECT min(answered_at) FROM tagged),
    'last_at', (SELECT max(answered_at) FROM tagged),
    'withheld_mock_answers', (SELECT count(*) FROM public.question_attempts WHERE user_id = uid AND source = 'mock')
                             - (SELECT count(*) FROM tagged WHERE source = 'mock'),
    'thresholds', jsonb_build_object(
      'window', public.rcfg('topic_window'), 'min_answers', public.rcfg('topic_min_answers'),
      'weak_max_pct', public.rcfg('weak_max_pct'), 'mastered_min_pct', public.rcfg('mastered_min_pct')),
    'domains', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'code', code, 'name', name, 'exam_weight_pct', exam_weight_pct,
        'answered', answered, 'correct', correct, 'recent_answered', recent_n, 'recent_correct', recent_c,
        'state', CASE
                   WHEN recent_n < public.rcfg('topic_min_answers') THEN 'new'
                   WHEN 100.0 * recent_c / recent_n <= public.rcfg('weak_max_pct') THEN 'weak'
                   WHEN 100.0 * recent_c / recent_n >= public.rcfg('mastered_min_pct') THEN 'mastered'
                   ELSE 'developing' END
      ) ORDER BY display_order NULLS LAST, id) FROM dom), '[]'::jsonb),
    'taxonomy', COALESCE((SELECT jsonb_agg(jsonb_build_object('level', level, 'answered', answered, 'correct', correct)) FROM tax), '[]'::jsonb),
    -- Per question [id, answered, correct]: the app groups these by topic review (the same keyword rule that links a
    -- question to its review in practice), because `topics` are too fine-grained to aggregate (about one live
    -- question per topic).
    'questions', COALESCE((SELECT jsonb_agg(jsonb_build_array(question_id, answered, correct)) FROM per_q), '[]'::jsonb),
    'topics_touched', (SELECT count(DISTINCT topic_id) FROM tagged),
    'activity', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'answered', answered, 'correct', correct) ORDER BY day) FROM act), '[]'::jsonb),
    'today', public.local_date(now())
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.my_study_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_study_analytics() TO authenticated;

COMMENT ON FUNCTION public.my_study_analytics() IS
  'The caller''s own study analytics (D8 option 2): counts by domain (with ranking-v2 state), taxonomy, question, and daily '
  'activity. Unreleased mock answers are excluded and counted in withheld_mock_answers. Never returns other students'' data.';
