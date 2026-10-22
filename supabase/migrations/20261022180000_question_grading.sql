-- Student question generation with AI evaluation (Jade's Template 3): the platform assigns each student question's topic,
-- domain, taxonomy and stem length; the student writes the stem, four options and an optional rationale; an AI grader
-- scores it (stem /30, options /45, alignment /25, rationale bonus +0/3/5; 75+ passes) and writes feedback per bar.
-- Two grading pathways, chosen in qgen_config.grading_mode (Jade decides; Ian 2026-10-22):
--   'api'   — the app calls the Anthropic API when the student submits (paid per question), result in seconds;
--   'agent' — the evaluation is queued and graded in batches by an agent session on the existing subscriptions
--             (scripts/grade-questions.ts pull/finish, brief docs/phase-1/QGEN_GRADING_BRIEF.md);
--   'off'   — no AI grading; teachers review as before.
-- The grade is advice: a teacher still approves every question before it goes live (questions_approval_needs_a_reviewer).
-- Also here: the "write one question every 24 hours" rule and the Template 3.8 leaderboard, both off until Jade decides.
--
-- Rollback: DROP FUNCTION public.qgen_leaderboard(), public.qgen_daily_status(); DROP TABLE public.question_evaluations,
-- public.qgen_assignments, public.qgen_config.

CREATE TABLE IF NOT EXISTS public.qgen_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  confirmed  BOOLEAN NOT NULL,
  note       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.qgen_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qgen_config: read" ON public.qgen_config;
CREATE POLICY "qgen_config: read" ON public.qgen_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "qgen_config: admin update" ON public.qgen_config;
CREATE POLICY "qgen_config: admin update" ON public.qgen_config FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.qgen_config FROM anon, authenticated;
GRANT SELECT, UPDATE (value, note, updated_at) ON public.qgen_config TO authenticated;

INSERT INTO public.qgen_config (key, value, confirmed, note) VALUES
  ('grading_mode', 'agent', false, 'off | agent | api. Jade chooses (Decisions for Jade). agent queues grades for an agent session; api grades at submit time (needs ANTHROPIC_API_KEY on the server).'),
  ('pass_mark',    '75',    true,  'Jade Template 3.6: 75+ of 100 (105 with the rationale bonus) passes'),
  ('daily_rule',   'off',   false, 'off | on. Template/prototype: a student writes one question every 24 hours to keep studying. Jade decides.'),
  ('leaderboard',  'off',   false, 'off | staff | students. Template 3.8 leaderboard. Jade asked for rank-only for students, so off until he decides.')
ON CONFLICT (key) DO NOTHING;

-- What the platform asked a student to write. One open assignment per student; a submission closes it.
CREATE TABLE IF NOT EXISTS public.qgen_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method      TEXT NOT NULL CHECK (method IN ('bank', 'practice', 'review')),
  review_slug TEXT,
  domain_id   INT NOT NULL REFERENCES public.domains(id),
  topic_id    INT REFERENCES public.topics(id) ON DELETE SET NULL,
  topic       TEXT NOT NULL,
  taxonomy    TEXT NOT NULL CHECK (taxonomy IN ('KC', 'AP', 'ASE')),
  stem_length TEXT NOT NULL CHECK (stem_length IN ('short', 'medium', 'medium_long', 'long')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qgen_assignment_open ON public.qgen_assignments(user_id) WHERE used_at IS NULL;
ALTER TABLE public.qgen_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qgen_assignments: own read" ON public.qgen_assignments;
CREATE POLICY "qgen_assignments: own read" ON public.qgen_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());
REVOKE ALL ON public.qgen_assignments FROM anon, authenticated;
GRANT SELECT ON public.qgen_assignments TO authenticated;

-- One AI evaluation per student question, written by the app (api) or the grading CLI (agent) with the service role.
CREATE TABLE IF NOT EXISTS public.question_evaluations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL UNIQUE REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment  JSONB NOT NULL,
  pathway     TEXT NOT NULL CHECK (pathway IN ('api', 'agent')),
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  result      JSONB,
  overall     INT CHECK (overall BETWEEN 0 AND 105),
  passed      BOOLEAN,
  model       TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_question_evaluations_status ON public.question_evaluations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_question_evaluations_user ON public.question_evaluations(user_id, created_at DESC);
ALTER TABLE public.question_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "question_evaluations: own or staff read" ON public.question_evaluations;
CREATE POLICY "question_evaluations: own or staff read" ON public.question_evaluations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());
REVOKE ALL ON public.question_evaluations FROM anon, authenticated;
GRANT SELECT ON public.question_evaluations TO authenticated;

-- The 24-hour rule: is the caller due a question? Only students, only when the rule is on, and not in their first day.
CREATE OR REPLACE FUNCTION public.qgen_daily_status()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  rule_on BOOLEAN := (SELECT value FROM public.qgen_config WHERE key = 'daily_rule') = 'on';
  last_at TIMESTAMPTZ;
  joined  TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  SELECT max(q.created_at) INTO last_at FROM public.questions q WHERE q.created_by = uid AND q.source = 'student-submission';
  SELECT p.created_at INTO joined FROM public.profiles p WHERE p.id = uid;
  RETURN jsonb_build_object(
    'rule_on', rule_on,
    'last_submitted_at', last_at,
    'due', rule_on AND NOT public.is_staff(uid) AND joined < now() - interval '24 hours'
           AND (last_at IS NULL OR last_at < now() - interval '24 hours'));
END;
$$;

-- Template 3.8 leaderboard over teacher-approved student questions: 10 points (AI score 75–89 or ungraded), 15 (90+),
-- +5 for an excellent rationale, +5 for every run of 3 approved in a row and +15 for a run of 5. Names follow the
-- student's "show my badges to classmates" switch. Empty unless qgen_config.leaderboard allows the caller.
CREATE OR REPLACE FUNCTION public.qgen_leaderboard()
RETURNS TABLE (user_id UUID, display_name TEXT, points INT, approved INT, is_me BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH mode AS (SELECT value FROM public.qgen_config WHERE key = 'leaderboard'),
  allowed AS (
    SELECT auth.uid() IS NOT NULL AND ((SELECT value FROM mode) = 'students'
           OR ((SELECT value FROM mode) = 'staff' AND public.is_teaching_staff())) AS ok
  ),
  decided AS (
    SELECT q.created_by AS uid, q.created_at, q.review_status = 'approved' AS ok, e.overall,
           COALESCE((e.result -> 'rationale' ->> 'bonus')::int, 0) AS bonus
      FROM public.questions q
      LEFT JOIN public.question_evaluations e ON e.question_id = q.id AND e.status = 'done'
     WHERE q.source = 'student-submission' AND q.review_status IN ('approved', 'rejected', 'needs_changes')
  ),
  runs AS (
    SELECT uid, ok, created_at, overall, bonus,
           sum(CASE WHEN ok THEN 0 ELSE 1 END) OVER (PARTITION BY uid ORDER BY created_at) AS grp
      FROM decided
  ),
  run_len AS (
    SELECT uid, grp, count(*) FILTER (WHERE ok) AS n FROM runs GROUP BY uid, grp
  ),
  per_user AS (
    SELECT r.uid,
           sum(CASE WHEN r.ok THEN (CASE WHEN r.overall >= 90 THEN 15 ELSE 10 END) + CASE WHEN r.bonus = 5 THEN 5 ELSE 0 END ELSE 0 END)::int AS q_points,
           count(*) FILTER (WHERE r.ok)::int AS approved
      FROM runs r GROUP BY r.uid
  ),
  streaks AS (
    SELECT uid, sum(CASE WHEN n >= 5 THEN 15 WHEN n >= 3 THEN 5 ELSE 0 END)::int AS s_points FROM run_len GROUP BY uid
  )
  SELECT p.uid,
         CASE WHEN pr.show_badges OR p.uid = auth.uid()
              THEN COALESCE(split_part(pr.full_name, ' ', 1) || COALESCE(' ' || left(nullif(split_part(pr.full_name, ' ', 2), ''), 1) || '.', ''), 'Student')
              ELSE 'A student' END,
         p.q_points + COALESCE(s.s_points, 0),
         p.approved,
         p.uid = auth.uid()
    FROM per_user p
    JOIN public.profiles pr ON pr.id = p.uid AND pr.role = 'student'
    LEFT JOIN streaks s ON s.uid = p.uid, allowed
   WHERE allowed.ok AND p.approved > 0
   ORDER BY 3 DESC, 4 DESC
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.qgen_daily_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.qgen_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qgen_daily_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.qgen_leaderboard() TO authenticated;
