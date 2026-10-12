-- Ranking v2, phase 2c: the rules engine. Topic state, weighted practice XP, the daily cap, the mastery milestone and
-- the streak bonus, all computed on read from question_attempts (no counters). Every number comes from rcfg().
--
-- In shadow mode (rcfg('rules_live') = 0) students are paid exactly as before and the new amounts go to xp_shadow.
-- "Days" are Trinidad days (America/Port_of_Spain), now that the streak pays XP.

CREATE OR REPLACE FUNCTION public.local_date(p_ts TIMESTAMPTZ)
RETURNS DATE LANGUAGE sql IMMUTABLE
AS $$ SELECT (p_ts AT TIME ZONE 'America/Port_of_Spain')::date $$;

-- A topic's state from the student's last N answers in it (all sources), optionally as it stood before a moment.
CREATE OR REPLACE FUNCTION public.topic_state(p_user UUID, p_domain INT, p_before TIMESTAMPTZ DEFAULT 'infinity')
RETURNS TABLE (state TEXT, answers INT, accuracy NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT is_correct FROM public.question_attempts
     WHERE user_id = p_user AND domain_id = p_domain AND answered_at < p_before
     ORDER BY answered_at DESC
     LIMIT (public.rcfg('topic_window'))::int
  ), t AS (
    SELECT count(*)::int AS n, count(*) FILTER (WHERE is_correct)::int AS c FROM recent
  )
  SELECT CASE
           WHEN n < public.rcfg('topic_min_answers') THEN 'new'
           WHEN 100.0 * c / n <= public.rcfg('weak_max_pct') THEN 'weak'
           WHEN 100.0 * c / n >= public.rcfg('mastered_min_pct') THEN 'mastered'
           ELSE 'developing'
         END,
         n,
         CASE WHEN n = 0 THEN NULL ELSE round(100.0 * c / n, 1) END
    FROM t
$$;

CREATE OR REPLACE FUNCTION public.topic_multiplier(p_state TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.rcfg('mult_' || p_state) $$;

-- Session XP from the banded base and the per-answer weights: round(base x mean weight), at least 1.
-- Pure, so the plan's worked examples can be tested directly.
CREATE OR REPLACE FUNCTION public.practice_xp_v2(p_answered INT, p_weights NUMERIC[])
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(1, round(public.xp_for_practice(p_answered)
                           * (SELECT avg(w) FROM unnest(p_weights) w)))::int
$$;

-- Streak bonus for a day that is the Nth in a row: 10 x N, capped at 70.
CREATE OR REPLACE FUNCTION public.streak_bonus(p_length INT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT LEAST(public.rcfg('streak_xp_per_day') * p_length, public.rcfg('streak_xp_cap'))::int $$;

-- Consecutive qualifying days (10+ distinct questions, Trinidad time) ending on p_day; 0 if p_day does not qualify.
CREATE OR REPLACE FUNCTION public.streak_length_on(p_user UUID, p_day DATE)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT public.local_date(answered_at) AS d
      FROM public.question_attempts
     WHERE user_id = p_user AND public.local_date(answered_at) <= p_day
     GROUP BY 1
    HAVING count(DISTINCT question_id) >= public.rcfg('streak_min_questions')
  ), islands AS (
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS g FROM days
  )
  SELECT COALESCE((SELECT count(*)::int FROM islands WHERE g = (SELECT g FROM islands WHERE d = p_day)), 0)
$$;

-- The live streak for display: today's run, or yesterday's if today's 10 questions haven't happened yet.
CREATE OR REPLACE FUNCTION public.study_streak_v2(p_user UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE today DATE := public.local_date(now()); n INT;
BEGIN
  IF p_user <> auth.uid() AND NOT public.is_teaching_staff() THEN
    RAISE EXCEPTION 'not your streak' USING ERRCODE = '42501';
  END IF;
  n := public.streak_length_on(p_user, today);
  IF n = 0 THEN n := public.streak_length_on(p_user, today - 1); END IF;
  RETURN n;
END;
$$;

-- The legacy streak counts Trinidad days too (was UTC). Still the flag-off display.
CREATE OR REPLACE FUNCTION public.study_streak(p_user UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH qualifying AS (
    SELECT d FROM (
      SELECT public.local_date(finished_at) AS d, total_answered AS n
        FROM public.practice_sessions WHERE student_id = p_user
      UNION ALL
      SELECT public.local_date(completed_at) AS d, COALESCE(total_questions, 0) AS n
        FROM public.mock_exam_sessions WHERE student_id = p_user AND completed_at IS NOT NULL
    ) daily
    GROUP BY d
    HAVING SUM(n) >= 10
  ),
  islands AS (
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS island FROM qualifying
  )
  SELECT COALESCE((
    SELECT COUNT(*)::int FROM islands
     WHERE island = (SELECT island FROM islands ORDER BY d DESC LIMIT 1)
       AND (SELECT MAX(d) FROM qualifying) >= public.local_date(now()) - 1
  ), 0)
$$;

-- Topics a student has been Weak in at the end of some session: the precondition for the Weak -> Mastered bonus.
CREATE TABLE IF NOT EXISTS public.topic_weak_marks (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain_id  INT NOT NULL REFERENCES public.domains(id),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, domain_id)
);
ALTER TABLE public.topic_weak_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topic_weak_marks: staff read" ON public.topic_weak_marks;
CREATE POLICY "topic_weak_marks: staff read" ON public.topic_weak_marks FOR SELECT TO authenticated USING (public.is_teaching_staff());
REVOKE ALL ON public.topic_weak_marks FROM anon, authenticated;
GRANT SELECT ON public.topic_weak_marks TO authenticated;

-- After any answers are recorded: pay (or shadow) today's streak bonus and any Weak -> Mastered milestones.
-- Both are idempotent through deterministic source ids: one streak award per student per day, one milestone per topic.
CREATE OR REPLACE FUNCTION public.apply_answer_bonuses(p_user UUID, p_domains INT[], p_live BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today  DATE := public.local_date(now());
  len    INT;
  amt    INT;
  src    UUID;
  d      INT;
  st     TEXT;
  out    JSONB := '{}'::jsonb;
BEGIN
  IF public.is_staff(p_user) THEN RETURN out; END IF;

  len := public.streak_length_on(p_user, today);
  IF len > 0 THEN
    amt := public.streak_bonus(len);
    src := md5(p_user::text || ':streak:' || today::text)::uuid;
    IF p_live THEN
      PERFORM public.award_xp_detail(p_user, amt, 'streak_day', src, jsonb_build_object('day', today, 'streak', len));
    ELSE
      INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
      VALUES (p_user, 'streak_day', src, 0, amt, jsonb_build_object('day', today, 'streak', len))
      ON CONFLICT (kind, source_id) DO NOTHING;
    END IF;
    out := out || jsonb_build_object('streak', len, 'streak_bonus', amt);
  END IF;

  FOREACH d IN ARRAY COALESCE(p_domains, '{}') LOOP
    SELECT state INTO st FROM public.topic_state(p_user, d);
    IF st = 'weak' THEN
      INSERT INTO public.topic_weak_marks (user_id, domain_id) VALUES (p_user, d) ON CONFLICT DO NOTHING;
    ELSIF st = 'mastered' AND EXISTS (SELECT 1 FROM public.topic_weak_marks WHERE user_id = p_user AND domain_id = d) THEN
      src := md5(p_user::text || ':mastered:' || d::text)::uuid;
      IF p_live THEN
        PERFORM public.award_xp_detail(p_user, public.rcfg('mastery_bonus')::int, 'topic_mastered', src, jsonb_build_object('domain_id', d));
      ELSE
        INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
        VALUES (p_user, 'topic_mastered', src, 0, public.rcfg('mastery_bonus')::int, jsonb_build_object('domain_id', d))
        ON CONFLICT (kind, source_id) DO NOTHING;
      END IF;
      out := out || jsonb_build_object('mastered_domain_' || d, true);
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

-- Practice: weight each answer by its topic's state at session start and by repeats, pay the weighted, capped amount
-- (live) or log it next to the old banded amount (shadow), then apply the streak and milestone bonuses.
CREATE OR REPLACE FUNCTION public.record_practice_answers(p_answers JSONB, p_domain INT DEFAULT NULL)
RETURNS public.practice_sessions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid        UUID := auth.uid();
  live       BOOLEAN;
  n_total    INT;
  n_correct  INT;
  row        public.practice_sessions;
  old_amt    INT;
  raw_amt    INT;
  paid_today INT;
  new_amt    INT;
  domains    INT[];
  breakdown  JSONB;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be a list' USING ERRCODE = '22023';
  END IF;
  n_total := jsonb_array_length(p_answers);
  IF n_total < 1 OR n_total > 200 THEN
    RAISE EXCEPTION 'implausible session length' USING ERRCODE = '22023';
  END IF;
  live := public.rcfg('rules_live') = 1;

  DROP TABLE IF EXISTS _ans, _graded, _states;
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
  IF EXISTS (SELECT 1 FROM _ans x LEFT JOIN public.questions q ON q.id = x.question_id
              WHERE q.id IS NULL OR NOT q.is_active OR q.context <> 'standalone') THEN
    RAISE EXCEPTION 'unknown or inactive question' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM _ans x, unnest(x.option_ids) oid
              WHERE NOT EXISTS (SELECT 1 FROM public.question_options o WHERE o.id = oid AND o.question_id = x.question_id)) THEN
    RAISE EXCEPTION 'an option does not belong to its question' USING ERRCODE = '22023';
  END IF;

  -- Topic states as they stood at the start of the session (before these answers are written).
  CREATE TEMP TABLE _states ON COMMIT DROP AS
  SELECT d.domain_id, s.state
    FROM (SELECT DISTINCT q.domain_id FROM _ans x JOIN public.questions q ON q.id = x.question_id) d,
         LATERAL public.topic_state(uid, d.domain_id) s;

  CREATE TEMP TABLE _graded ON COMMIT DROP AS
  SELECT x.question_id, x.option_ids, q.domain_id, st.state,
         (SELECT array_agg(o.id ORDER BY o.id) FROM public.question_options o WHERE o.question_id = x.question_id AND o.is_correct)
           = (SELECT array_agg(DISTINCT c ORDER BY c) FROM unnest(x.option_ids) c) AS is_correct,
         EXISTS (SELECT 1 FROM public.question_attempts p
                  WHERE p.user_id = uid AND p.question_id = x.question_id
                    AND p.answered_at > now() - make_interval(days => public.rcfg('repeat_days')::int)) AS is_repeat
    FROM _ans x JOIN public.questions q ON q.id = x.question_id
    LEFT JOIN _states st ON st.domain_id IS NOT DISTINCT FROM q.domain_id;

  SELECT COUNT(*) FILTER (WHERE is_correct) INTO n_correct FROM _graded;

  INSERT INTO public.practice_sessions (student_id, total_answered, correct_count, domain_id)
  VALUES (uid, n_total, n_correct, p_domain)
  RETURNING * INTO row;

  INSERT INTO public.question_attempts (user_id, question_id, option_ids, domain_id, is_correct, source, session_id, xp_weight)
  SELECT uid, question_id, option_ids, domain_id, COALESCE(is_correct, false), 'practice', row.id,
         public.topic_multiplier(COALESCE(state, 'new')) * CASE WHEN is_repeat THEN public.rcfg('repeat_factor') ELSE 1 END
    FROM _graded;

  -- New rules: weighted amount, then the daily cap (Trinidad day) against what the same mode has already paid today.
  old_amt := public.xp_for_practice(n_total);
  raw_amt := public.practice_xp_v2(n_total, (SELECT array_agg(xp_weight) FROM public.question_attempts WHERE session_id = row.id));
  IF live THEN
    SELECT COALESCE(sum(amount), 0) INTO paid_today FROM public.xp_events
     WHERE user_id = uid AND reason = 'practice_session' AND public.local_date(created_at) = public.local_date(now());
  ELSE
    SELECT COALESCE(sum(new_amount), 0) INTO paid_today FROM public.xp_shadow
     WHERE user_id = uid AND kind = 'practice' AND public.local_date(created_at) = public.local_date(now());
  END IF;
  new_amt := LEAST(raw_amt, GREATEST(0, public.rcfg('practice_daily_cap')::int - paid_today));

  breakdown := jsonb_build_object(
    'base', old_amt, 'raw', raw_amt, 'paid_today_before', paid_today, 'capped_to', new_amt,
    'mean_weight', (SELECT round(avg(xp_weight), 4) FROM public.question_attempts WHERE session_id = row.id),
    'states', (SELECT jsonb_object_agg(COALESCE(domain_id::text, 'none'), state) FROM _states),
    'repeats', (SELECT count(*) FROM _graded WHERE is_repeat));

  IF live THEN
    PERFORM public.award_xp_detail(uid, new_amt, 'practice_session', row.id, breakdown);
  ELSE
    PERFORM public.award_xp(uid, old_amt, 'practice_session', row.id);
    IF NOT public.is_staff(uid) THEN
      INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
      VALUES (uid, 'practice', row.id, old_amt, new_amt, breakdown)
      ON CONFLICT (kind, source_id) DO NOTHING;
    END IF;
  END IF;

  SELECT array_agg(DISTINCT domain_id) INTO domains FROM _graded WHERE domain_id IS NOT NULL;
  PERFORM public.apply_answer_bonuses(uid, domains, live);
  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.record_practice_answers(JSONB, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_practice_answers(JSONB, INT) TO authenticated;

-- Internal helpers: not callable by students (they would expose topic states and multipliers).
REVOKE ALL ON FUNCTION public.topic_state(UUID, INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.topic_multiplier(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_xp_v2(INT, NUMERIC[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.streak_bonus(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.streak_length_on(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_answer_bonuses(UUID, INT[], BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topic_state(UUID, INT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.practice_xp_v2(INT, NUMERIC[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.streak_bonus(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.streak_length_on(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_answer_bonuses(UUID, INT[], BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.study_streak_v2(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.study_streak_v2(UUID) TO authenticated;
