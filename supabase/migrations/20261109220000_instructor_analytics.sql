-- Instructor analytics: an at-risk list and class trends for teaching staff (Ian approved the at-risk definition
-- 2026-11-09). Students never see this: the function refuses anyone who is not teacher/admin/super_admin, and the
-- student-side analytics (my_study_analytics) still never compares a student with classmates.
--
-- A student is AT RISK when any of these is true (every number is a ranking_config row, so it can be tuned without code):
--   inactive  : no answers of any kind (practice, promotion quiz, mock) for risk_inactive_days (7), or none ever and the
--               account is older than that
--   low       : under risk_low_pct (50%) correct over their last risk_recent_answers (50) answers, once they have at
--               least risk_min_answers (20)
--   mock      : their latest finished mock in the last risk_mock_recent_days (30) scored under mock_pass_pct (70%;
--               the platform had no mock pass mark before this, so 70 is a proposal for Jade to confirm)
--   drop      : accuracy over the last risk_drop_days (14) is risk_drop_points (15) or more points below the 14 days
--               before, with at least risk_min_answers in each fortnight
--
-- Read-only and additive: config rows plus one function. ROLLBACK:
--   DROP FUNCTION public.class_analytics();
--   DELETE FROM public.ranking_config WHERE key LIKE 'risk\_%' OR key = 'mock_pass_pct';

INSERT INTO public.ranking_config (key, value, confirmed, note) VALUES
  ('risk_inactive_days',    7,  true,  'Ian, 2026-11-09: at risk after 7 days with no answers'),
  ('risk_recent_answers',   50, true,  'Ian, 2026-11-09: accuracy is judged over the last 50 answers'),
  ('risk_low_pct',          50, true,  'Ian, 2026-11-09: at risk under 50% over those answers'),
  ('risk_min_answers',      20, false, 'Proposed: accuracy and drop rules need at least 20 answers, so a few early misses do not flag a student'),
  ('mock_pass_pct',         70, false, 'Proposed: mock exam pass mark (no mock pass mark existed before). Jade to confirm'),
  ('risk_mock_recent_days', 30, false, 'Proposed: a mock counts as recent for 30 days'),
  ('risk_drop_points',      15, true,  'Ian, 2026-11-09: at risk on a 15-point accuracy drop'),
  ('risk_drop_days',        14, true,  'Ian, 2026-11-09: the drop compares the last fortnight with the one before')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.class_analytics()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inactive_days INT     := public.rcfg('risk_inactive_days');
  recent_n      INT     := public.rcfg('risk_recent_answers');
  low_pct       NUMERIC := public.rcfg('risk_low_pct');
  min_n         INT     := public.rcfg('risk_min_answers');
  pass_pct      NUMERIC := public.rcfg('mock_pass_pct');
  mock_days     INT     := public.rcfg('risk_mock_recent_days');
  drop_pts      NUMERIC := public.rcfg('risk_drop_points');
  drop_days     INT     := public.rcfg('risk_drop_days');
  result JSONB;
BEGIN
  IF NOT public.is_teaching_staff() THEN
    RAISE EXCEPTION 'teaching staff only' USING ERRCODE = '42501';
  END IF;

  WITH students AS (
    SELECT p.id, p.full_name, u.email, p.created_at, p.effective_plan
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE p.role = 'student' AND p.suspended_at IS NULL
  ), ranked AS (
    SELECT a.user_id, a.is_correct, a.answered_at,
           row_number() OVER (PARTITION BY a.user_id ORDER BY a.answered_at DESC) AS rn
      FROM public.question_attempts a JOIN students s ON s.id = a.user_id
  ), per AS (
    SELECT s.id,
           max(r.answered_at) AS last_at,
           count(r.*)::int AS total,
           count(r.*) FILTER (WHERE r.rn <= recent_n)::int AS rec_n,
           count(r.*) FILTER (WHERE r.rn <= recent_n AND r.is_correct)::int AS rec_c,
           count(r.*) FILTER (WHERE r.answered_at >= now() - make_interval(days => drop_days))::int AS f1_n,
           count(r.*) FILTER (WHERE r.answered_at >= now() - make_interval(days => drop_days) AND r.is_correct)::int AS f1_c,
           count(r.*) FILTER (WHERE r.answered_at <  now() - make_interval(days => drop_days)
                                AND r.answered_at >= now() - make_interval(days => 2 * drop_days))::int AS f0_n,
           count(r.*) FILTER (WHERE r.answered_at <  now() - make_interval(days => drop_days)
                                AND r.answered_at >= now() - make_interval(days => 2 * drop_days) AND r.is_correct)::int AS f0_c
      FROM students s LEFT JOIN ranked r ON r.user_id = s.id
     GROUP BY s.id
  ), last_mock AS (
    SELECT DISTINCT ON (m.student_id) m.student_id, m.score_pct, m.completed_at, st.title
      FROM public.mock_exam_sessions m JOIN public.mock_exam_sets st ON st.id = m.set_id
     WHERE m.completed_at IS NOT NULL AND m.score_pct IS NOT NULL
     ORDER BY m.student_id, m.completed_at DESC
  ), flagged AS (
    SELECT s.id, s.full_name, s.email, s.created_at, s.effective_plan, p.last_at, p.total, p.rec_n, p.rec_c,
           p.f0_n, p.f0_c, p.f1_n, p.f1_c, lm.score_pct AS mock_pct, lm.completed_at AS mock_at, lm.title AS mock_title,
           array_remove(ARRAY[
             CASE WHEN COALESCE(p.last_at, s.created_at) < now() - make_interval(days => inactive_days) THEN 'inactive' END,
             CASE WHEN p.rec_n >= min_n AND 100.0 * p.rec_c / p.rec_n < low_pct THEN 'low' END,
             CASE WHEN lm.completed_at >= now() - make_interval(days => mock_days) AND lm.score_pct < pass_pct THEN 'mock' END,
             CASE WHEN p.f0_n >= min_n AND p.f1_n >= min_n
                   AND 100.0 * p.f0_c / p.f0_n - 100.0 * p.f1_c / p.f1_n >= drop_pts THEN 'drop' END
           ], NULL) AS reasons
      FROM students s JOIN per p ON p.id = s.id LEFT JOIN last_mock lm ON lm.student_id = s.id
  ), weeks AS (
    SELECT generate_series(date_trunc('week', public.local_date(now()))::date - 77,
                           date_trunc('week', public.local_date(now()))::date, interval '7 days')::date AS wk
  ), weekly AS (
    SELECT w.wk,
           (SELECT count(DISTINCT a.user_id) FROM public.question_attempts a JOIN students s ON s.id = a.user_id
             WHERE public.local_date(a.answered_at) >= w.wk AND public.local_date(a.answered_at) < w.wk + 7)::int AS active,
           (SELECT count(*) FROM public.question_attempts a JOIN students s ON s.id = a.user_id
             WHERE public.local_date(a.answered_at) >= w.wk AND public.local_date(a.answered_at) < w.wk + 7)::int AS answered,
           (SELECT count(*) FILTER (WHERE a.is_correct) FROM public.question_attempts a JOIN students s ON s.id = a.user_id
             WHERE public.local_date(a.answered_at) >= w.wk AND public.local_date(a.answered_at) < w.wk + 7)::int AS correct,
           (SELECT count(*) FROM public.mock_exam_sessions m JOIN students s ON s.id = m.student_id
             WHERE m.completed_at IS NOT NULL AND public.local_date(m.completed_at) >= w.wk AND public.local_date(m.completed_at) < w.wk + 7)::int AS mocks,
           (SELECT round(avg(m.score_pct), 1) FROM public.mock_exam_sessions m JOIN students s ON s.id = m.student_id
             WHERE m.completed_at IS NOT NULL AND public.local_date(m.completed_at) >= w.wk AND public.local_date(m.completed_at) < w.wk + 7) AS mock_avg
      FROM weeks w
  ), dom AS (
    SELECT d.id, d.code, d.name, d.display_order,
           count(a.*) FILTER (WHERE a.answered_at >= now() - interval '30 days')::int AS n_now,
           count(a.*) FILTER (WHERE a.answered_at >= now() - interval '30 days' AND a.is_correct)::int AS c_now,
           count(a.*) FILTER (WHERE a.answered_at < now() - interval '30 days')::int AS n_before,
           count(a.*) FILTER (WHERE a.answered_at < now() - interval '30 days' AND a.is_correct)::int AS c_before,
           count(DISTINCT a.user_id) FILTER (WHERE a.answered_at >= now() - interval '30 days')::int AS students_now
      FROM public.domains d
      LEFT JOIN (SELECT a.* FROM public.question_attempts a JOIN students s ON s.id = a.user_id
                  WHERE a.answered_at >= now() - interval '60 days') a ON a.domain_id = d.id
     GROUP BY d.id
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'thresholds', jsonb_build_object(
      'inactive_days', inactive_days, 'recent_answers', recent_n, 'low_pct', low_pct, 'min_answers', min_n,
      'mock_pass_pct', pass_pct, 'mock_recent_days', mock_days, 'drop_points', drop_pts, 'drop_days', drop_days,
      'unconfirmed', (SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) FROM public.ranking_config
                       WHERE NOT confirmed AND (key LIKE 'risk\_%' OR key = 'mock_pass_pct'))),
    'students', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', full_name, 'email', email, 'joined_at', created_at, 'plan', effective_plan,
        'last_at', last_at, 'answered', total, 'recent_answered', rec_n, 'recent_correct', rec_c,
        'prev_fortnight', jsonb_build_array(f0_n, f0_c), 'this_fortnight', jsonb_build_array(f1_n, f1_c),
        'last_mock', CASE WHEN mock_at IS NULL THEN NULL ELSE jsonb_build_object('pct', mock_pct, 'at', mock_at, 'title', mock_title) END,
        'reasons', to_jsonb(reasons)
      ) ORDER BY cardinality(reasons) DESC, last_at ASC NULLS FIRST) FROM flagged), '[]'::jsonb),
    'weeks', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', wk, 'active', active, 'answered', answered,
        'correct', correct, 'mocks', mocks, 'mock_avg', mock_avg) ORDER BY wk) FROM weekly), '[]'::jsonb),
    'domains', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name,
        'answered', n_now, 'correct', c_now, 'prev_answered', n_before, 'prev_correct', c_before, 'students', students_now)
        ORDER BY display_order NULLS LAST, id) FROM dom), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.class_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.class_analytics() TO authenticated;

COMMENT ON FUNCTION public.class_analytics() IS
  'Teaching staff only: every active student with their at-risk reasons (inactive, low, mock, drop; thresholds in '
  'ranking_config risk_* and mock_pass_pct), 12 weeks of class activity and accuracy, and class accuracy by domain '
  '(last 30 days against the 30 before). Students are never shown this.';
