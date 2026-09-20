-- Study streak, to the client's definition.
--
-- His Analytics template pins it: "consecutive days with ≥10 questions". Computed
-- on read from what we already record — practice sessions and completed mock
-- exams — so there is no counter to drift, and no nightly job to keep it honest.
--
-- Dates are taken in UTC. A student answering late at night in the Caribbean
-- (UTC-4) can therefore have work land on the next UTC day. Worth revisiting if
-- streaks ever gate anything; today they are decorative.

CREATE OR REPLACE FUNCTION public.study_streak(p_user UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH qualifying AS (
    -- Days on which this student answered at least 10 questions, from either source.
    SELECT d FROM (
      SELECT (finished_at AT TIME ZONE 'UTC')::date AS d, total_answered AS n
        FROM public.practice_sessions
       WHERE student_id = p_user
      UNION ALL
      SELECT (completed_at AT TIME ZONE 'UTC')::date AS d, COALESCE(total_questions, 0) AS n
        FROM public.mock_exam_sessions
       WHERE student_id = p_user AND completed_at IS NOT NULL
    ) daily
    GROUP BY d
    HAVING SUM(n) >= 10
  ),
  islands AS (
    -- Gaps-and-islands: consecutive dates share (date - row_number).
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS island FROM qualifying
  )
  SELECT COALESCE((
    SELECT COUNT(*)::int FROM islands
     WHERE island = (SELECT island FROM islands ORDER BY d DESC LIMIT 1)
       -- A streak only counts while it is still live: today, or yesterday if
       -- today's work hasn't happened yet.
       AND (SELECT MAX(d) FROM qualifying) >= CURRENT_DATE - 1
  ), 0)
$$;

REVOKE ALL ON FUNCTION public.study_streak(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_streak(UUID) TO authenticated;
