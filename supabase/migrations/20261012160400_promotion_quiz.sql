-- Ranking v2, phase 2e: the promotion quiz. XP makes a student eligible; passing the quiz promotes them.
--
-- Rank = the highest level passed, capped by the level the student's XP allows (Ian, 2026-10-12: everyone starts at
-- level 0 at go-live; no grandfathering). The server picks the questions by blueprint weight, stamps each question's
-- served_at when it is first shown, and accepts an answer only within promo_seconds (+ grace) of that. A question left
-- past its time is scored wrong and the quiz moves on; there is no going back. Students never read the question list
-- directly (promotion_questions is staff-only), so they cannot see upcoming questions.

CREATE TABLE IF NOT EXISTS public.promotion_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_level   INT NOT NULL CHECK (target_level BETWEEN 1 AND 24),
  question_count INT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  score          INT,
  passed         BOOLEAN
);
CREATE UNIQUE INDEX IF NOT EXISTS promotion_one_open ON public.promotion_attempts (user_id) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_promotion_user ON public.promotion_attempts (user_id, started_at DESC);
ALTER TABLE public.promotion_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promotion_attempts: own or staff read" ON public.promotion_attempts;
CREATE POLICY "promotion_attempts: own or staff read" ON public.promotion_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());
REVOKE ALL ON public.promotion_attempts FROM anon, authenticated;
GRANT SELECT ON public.promotion_attempts TO authenticated;

CREATE TABLE IF NOT EXISTS public.promotion_questions (
  attempt_id  UUID NOT NULL REFERENCES public.promotion_attempts(id) ON DELETE CASCADE,
  position    INT NOT NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id),
  served_at   TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  option_ids  UUID[],
  is_correct  BOOLEAN,
  timed_out   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (attempt_id, position)
);
ALTER TABLE public.promotion_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promotion_questions: staff read" ON public.promotion_questions;
CREATE POLICY "promotion_questions: staff read" ON public.promotion_questions FOR SELECT TO authenticated USING (public.is_teaching_staff());
REVOKE ALL ON public.promotion_questions FROM anon, authenticated;
GRANT SELECT ON public.promotion_questions TO authenticated;

-- ── Levels ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.xp_level(p_xp BIGINT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(max(level), 0) FROM public.rank_levels WHERE min_xp <= COALESCE(p_xp, 0) $$;

CREATE OR REPLACE FUNCTION public.promotion_passed_level(p_user UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(max(target_level), 0) FROM public.promotion_attempts WHERE user_id = p_user AND passed $$;

-- The caller's rank and promotion state. Students see their own; staff may pass any user.
CREATE OR REPLACE FUNCTION public.promotion_status(p_user UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid      UUID := COALESCE(p_user, auth.uid());
  xp       BIGINT;
  xl       INT;
  passed   INT;
  open_id  UUID;
  last_fail TIMESTAMPTZ;
  retake_at TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF uid <> auth.uid() AND NOT public.is_teaching_staff() THEN RAISE EXCEPTION 'not yours' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO xp FROM public.xp_events WHERE user_id = uid;
  xl := public.xp_level(xp);
  passed := public.promotion_passed_level(uid);
  SELECT id INTO open_id FROM public.promotion_attempts WHERE user_id = uid AND finished_at IS NULL;
  SELECT max(finished_at) INTO last_fail FROM public.promotion_attempts
   WHERE user_id = uid AND target_level = passed + 1 AND passed IS FALSE;
  retake_at := last_fail + make_interval(hours => public.rcfg('promo_retake_hours')::int);
  RETURN jsonb_build_object(
    'xp', xp,
    'xp_level', xl,
    'passed_level', passed,
    'rank_level', LEAST(passed, xl),
    'next_level', CASE WHEN passed < 24 THEN passed + 1 END,
    'next_level_min_xp', (SELECT min_xp FROM public.rank_levels WHERE level = passed + 1),
    'eligible', passed < 24 AND xl > passed,
    'open_attempt_id', open_id,
    'retake_available_at', CASE WHEN retake_at > now() THEN retake_at END);
END;
$$;
REVOKE ALL ON FUNCTION public.promotion_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_status(UUID) TO authenticated;

-- ── Start ───────────────────────────────────────────────────────────────────
-- Picks promo_questions live standalone questions, apportioned to the RENR blueprint (domains.exam_weight_pct) by
-- largest remainder, excluding anything the student answered in the last promo_exclude_recent_days; any shortfall in a
-- domain is filled from the rest of the bank. Returns the open attempt if one exists (resume).
CREATE OR REPLACE FUNCTION public.start_promotion_quiz()
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    UUID := auth.uid();
  st     JSONB;
  n      INT := public.rcfg('promo_questions')::int;
  att    UUID;
  picked INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  SELECT id INTO att FROM public.promotion_attempts WHERE user_id = uid AND finished_at IS NULL;
  IF att IS NOT NULL THEN RETURN att; END IF;

  st := public.promotion_status(uid);
  IF NOT (st->>'eligible')::boolean THEN
    RAISE EXCEPTION 'not eligible for a promotion quiz yet' USING ERRCODE = '22023';
  END IF;
  IF st->>'retake_available_at' IS NOT NULL THEN
    RAISE EXCEPTION 'you can retake this quiz after %', st->>'retake_available_at' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.promotion_attempts (user_id, target_level, question_count)
  VALUES (uid, (st->>'passed_level')::int + 1, n) RETURNING id INTO att;

  DROP TABLE IF EXISTS _pool, _quota;
  CREATE TEMP TABLE _pool ON COMMIT DROP AS
  SELECT q.id, q.domain_id, random() AS r
    FROM public.questions q
   WHERE q.is_active AND q.context = 'standalone'
     AND NOT EXISTS (SELECT 1 FROM public.question_attempts a
                      WHERE a.user_id = uid AND a.question_id = q.id
                        AND a.answered_at > now() - make_interval(days => public.rcfg('promo_exclude_recent_days')::int));

  -- Largest-remainder quota per domain.
  CREATE TEMP TABLE _quota ON COMMIT DROP AS
  WITH w AS (SELECT id, display_order, n * exam_weight_pct / 100.0 AS exact FROM public.domains WHERE exam_weight_pct > 0),
       f AS (SELECT id, display_order, floor(exact)::int AS base, exact - floor(exact) AS rem FROM w),
       left_over AS (SELECT n - sum(base)::int AS k FROM f)
  SELECT f.id AS domain_id,
         f.base + CASE WHEN ROW_NUMBER() OVER (ORDER BY f.rem DESC, f.display_order) <= (SELECT k FROM left_over) THEN 1 ELSE 0 END AS quota
    FROM f;

  INSERT INTO public.promotion_questions (attempt_id, position, question_id)
  SELECT att, ROW_NUMBER() OVER (ORDER BY random()), id
    FROM (SELECT p.id, ROW_NUMBER() OVER (PARTITION BY p.domain_id ORDER BY p.r) AS k, qt.quota
            FROM _pool p JOIN _quota qt ON qt.domain_id = p.domain_id) s
   WHERE k <= quota;

  SELECT count(*) INTO picked FROM public.promotion_questions WHERE attempt_id = att;
  IF picked < n THEN
    INSERT INTO public.promotion_questions (attempt_id, position, question_id)
    SELECT att, picked + ROW_NUMBER() OVER (ORDER BY p.r), p.id
      FROM _pool p
     WHERE NOT EXISTS (SELECT 1 FROM public.promotion_questions x WHERE x.attempt_id = att AND x.question_id = p.id)
     LIMIT n - picked;
    SELECT count(*) INTO picked FROM public.promotion_questions WHERE attempt_id = att;
  END IF;
  IF picked < n THEN
    RAISE EXCEPTION 'not enough unseen questions for a promotion quiz' USING ERRCODE = '22023';
  END IF;
  RETURN att;
END;
$$;
REVOKE ALL ON FUNCTION public.start_promotion_quiz() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_promotion_quiz() TO authenticated;

-- ── Internals ───────────────────────────────────────────────────────────────
-- Record one answer (or a timeout) for a position and mirror it into question_attempts (source 'promotion', no XP).
CREATE OR REPLACE FUNCTION public._promotion_record(p_att public.promotion_attempts, p_position INT, p_options UUID[], p_timed_out BOOLEAN, p_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pq public.promotion_questions; ok BOOLEAN;
BEGIN
  SELECT * INTO pq FROM public.promotion_questions WHERE attempt_id = p_att.id AND position = p_position;
  ok := NOT p_timed_out AND cardinality(COALESCE(p_options, '{}')) > 0 AND
        (SELECT array_agg(o.id ORDER BY o.id) FROM public.question_options o WHERE o.question_id = pq.question_id AND o.is_correct)
          = (SELECT array_agg(DISTINCT c ORDER BY c) FROM unnest(p_options) c);
  ok := COALESCE(ok, false);
  UPDATE public.promotion_questions SET answered_at = p_at, option_ids = COALESCE(p_options, '{}'), is_correct = ok, timed_out = p_timed_out
   WHERE attempt_id = p_att.id AND position = p_position;
  INSERT INTO public.question_attempts (user_id, question_id, option_ids, domain_id, is_correct, source, session_id, answered_at)
  SELECT p_att.user_id, pq.question_id, COALESCE(p_options, '{}'), q.domain_id, ok, 'promotion', p_att.id, p_at
    FROM public.questions q WHERE q.id = pq.question_id;
  RETURN ok;
END;
$$;

-- Score timed-out questions and, when nothing is left, finish the attempt. Returns the current position or NULL.
CREATE OR REPLACE FUNCTION public._promotion_settle(p_attempt UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  att  public.promotion_attempts;
  pq   public.promotion_questions;
  secs INT := public.rcfg('promo_seconds')::int;
  grace INT := public.rcfg('promo_grace_seconds')::int;
  sc   INT;
  doms INT[];
BEGIN
  SELECT * INTO att FROM public.promotion_attempts WHERE id = p_attempt FOR UPDATE;
  IF att.finished_at IS NOT NULL THEN RETURN NULL; END IF;
  LOOP
    SELECT * INTO pq FROM public.promotion_questions WHERE attempt_id = p_attempt AND answered_at IS NULL ORDER BY position LIMIT 1;
    EXIT WHEN pq.attempt_id IS NULL;
    IF pq.served_at IS NOT NULL AND now() > pq.served_at + make_interval(secs => secs + grace) THEN
      PERFORM public._promotion_record(att, pq.position, NULL, true, pq.served_at + make_interval(secs => secs));
    ELSE
      RETURN pq.position;
    END IF;
  END LOOP;
  -- All answered: finish.
  SELECT count(*) FILTER (WHERE is_correct) INTO sc FROM public.promotion_questions WHERE attempt_id = p_attempt;
  UPDATE public.promotion_attempts SET finished_at = now(), score = sc, passed = sc >= public.rcfg('promo_pass_mark')
   WHERE id = p_attempt;
  SELECT array_agg(DISTINCT q.domain_id) INTO doms FROM public.promotion_questions pq2 JOIN public.questions q ON q.id = pq2.question_id
   WHERE pq2.attempt_id = p_attempt AND q.domain_id IS NOT NULL;
  PERFORM public.apply_answer_bonuses(att.user_id, doms, public.rcfg('rules_live') = 1);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._promotion_record(public.promotion_attempts, INT, UUID[], BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._promotion_settle(UUID) FROM PUBLIC, anon, authenticated;

-- ── Student calls ───────────────────────────────────────────────────────────
-- The current question (stem and options, never the key), starting its clock if it hasn't started. When the quiz is
-- over, returns the result instead.
CREATE OR REPLACE FUNCTION public.promotion_current(p_attempt UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  att  public.promotion_attempts;
  pos  INT;
  pq   public.promotion_questions;
  secs INT := public.rcfg('promo_seconds')::int;
BEGIN
  SELECT * INTO att FROM public.promotion_attempts WHERE id = p_attempt;
  IF att.id IS NULL OR att.user_id <> auth.uid() THEN RAISE EXCEPTION 'not your quiz' USING ERRCODE = '42501'; END IF;
  pos := public._promotion_settle(p_attempt);
  IF pos IS NULL THEN
    SELECT * INTO att FROM public.promotion_attempts WHERE id = p_attempt;
    RETURN jsonb_build_object('done', true, 'score', att.score, 'total', att.question_count, 'passed', att.passed,
                              'target_level', att.target_level, 'pass_mark', public.rcfg('promo_pass_mark')::int);
  END IF;
  UPDATE public.promotion_questions SET served_at = now()
   WHERE attempt_id = p_attempt AND position = pos AND served_at IS NULL;
  SELECT * INTO pq FROM public.promotion_questions WHERE attempt_id = p_attempt AND position = pos;
  RETURN jsonb_build_object(
    'done', false, 'attempt_id', p_attempt, 'target_level', att.target_level,
    'position', pos, 'total', att.question_count,
    'seconds_left', GREATEST(0, secs - extract(epoch FROM now() - pq.served_at))::int,
    'question', (SELECT jsonb_build_object('id', q.id, 'body', q.body, 'question_type', q.question_type,
                   'options', (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body) ORDER BY o.display_order)
                                 FROM public.question_options o WHERE o.question_id = q.id))
                   FROM public.questions q WHERE q.id = pq.question_id));
END;
$$;
REVOKE ALL ON FUNCTION public.promotion_current(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_current(UUID) TO authenticated;

-- Answer the current question. Only the current position, only once, only within its time; no feedback until the end.
CREATE OR REPLACE FUNCTION public.promotion_answer(p_attempt UUID, p_position INT, p_option_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  att  public.promotion_attempts;
  pos  INT;
  pq   public.promotion_questions;
  secs INT := public.rcfg('promo_seconds')::int;
  grace INT := public.rcfg('promo_grace_seconds')::int;
BEGIN
  SELECT * INTO att FROM public.promotion_attempts WHERE id = p_attempt;
  IF att.id IS NULL OR att.user_id <> auth.uid() THEN RAISE EXCEPTION 'not your quiz' USING ERRCODE = '42501'; END IF;
  pos := public._promotion_settle(p_attempt);
  -- Too late: the clock ran out and the question was already scored wrong. Say so and move on.
  IF EXISTS (SELECT 1 FROM public.promotion_questions WHERE attempt_id = p_attempt AND position = p_position AND timed_out) THEN
    RETURN public.promotion_current(p_attempt) || jsonb_build_object('timed_out', true);
  END IF;
  IF pos IS NULL THEN RAISE EXCEPTION 'this quiz is over' USING ERRCODE = '22023'; END IF;
  IF p_position <> pos THEN RAISE EXCEPTION 'that question is not the current one' USING ERRCODE = '22023'; END IF;
  SELECT * INTO pq FROM public.promotion_questions WHERE attempt_id = p_attempt AND position = pos;
  IF pq.served_at IS NULL THEN RAISE EXCEPTION 'that question has not been shown yet' USING ERRCODE = '22023'; END IF;
  IF cardinality(COALESCE(p_option_ids, '{}')) = 0 THEN RAISE EXCEPTION 'choose an answer' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_option_ids) oid
              WHERE NOT EXISTS (SELECT 1 FROM public.question_options o WHERE o.id = oid AND o.question_id = pq.question_id)) THEN
    RAISE EXCEPTION 'an option does not belong to this question' USING ERRCODE = '22023';
  END IF;
  -- _promotion_settle already scored it wrong if it is past time + grace; within grace it is accepted.
  PERFORM public._promotion_record(att, pos, p_option_ids, false, now());
  PERFORM public._promotion_settle(p_attempt);
  RETURN public.promotion_current(p_attempt);
END;
$$;
REVOKE ALL ON FUNCTION public.promotion_answer(UUID, INT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_answer(UUID, INT, UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION public.xp_level(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xp_level(BIGINT) TO authenticated;
REVOKE ALL ON FUNCTION public.promotion_passed_level(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_passed_level(UUID) TO service_role;
