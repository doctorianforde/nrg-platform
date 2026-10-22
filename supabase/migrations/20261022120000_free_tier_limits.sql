-- Free-tier limits (Jade's v2 template, "Login & Authentication" 7.1 + "Subscription Management" 8.1):
-- a free student gets 10 practice questions a day and no mock exams. Standard and premium students, and all staff, are
-- unlimited. Case studies were already standard/premium only (start_case_attempt). Topic reviews and the Q-gen limit
-- wait for those features to exist.
--
-- Same shape as ranking_config: every number in one table, read with tcfg('key'). limits_live = 0 switches all of it
-- off, so prod can carry the code before there is a way to pay. Set limits_live = 1 to enforce.
--
-- What is counted: a practice question counts when its answer is revealed (the "Check answer" step, which is the only
-- way a student's browser receives a key). Re-checking the same question on the same day is free. Days are Trinidad days.
--
-- Rollback: DROP TRIGGER trg_free_tier_mock_sessions ON mock_exam_sessions; DROP TRIGGER trg_free_tier_group_members ON
-- exam_group_members; DROP TRIGGER trg_free_tier_practice_attempts ON question_attempts; then the functions and the two
-- tables below. Nothing existing is altered.

CREATE TABLE IF NOT EXISTS public.tier_config (
  key        TEXT PRIMARY KEY,
  value      NUMERIC NOT NULL,
  confirmed  BOOLEAN NOT NULL,
  note       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tier_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tier_config: read" ON public.tier_config;
CREATE POLICY "tier_config: read" ON public.tier_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tier_config: admin update" ON public.tier_config;
CREATE POLICY "tier_config: admin update" ON public.tier_config FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.tier_config FROM anon, authenticated;
GRANT SELECT, UPDATE (value, note, updated_at) ON public.tier_config TO authenticated;

INSERT INTO public.tier_config (key, value, confirmed, note) VALUES
  ('limits_live',           0,  true,  '0 = no limits for anyone; 1 = free students are limited. Turned on per environment.'),
  ('free_practice_per_day', 10, true,  'Jade v2 template 7.1/8.1: 10 questions a day on the free tier (v1 said 50; v2 wins)'),
  ('free_mock_exams',       0,  true,  'Jade v2 template 7.1/8.1: no mock exams on the free tier (1 = allow)')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tcfg(p_key TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v NUMERIC;
BEGIN
  SELECT value INTO v FROM public.tier_config WHERE key = p_key;
  IF v IS NULL THEN RAISE EXCEPTION 'tier_config has no %', p_key; END IF;
  RETURN v;
END;
$$;

-- True when the free-tier limits apply to this user: limits are live, they are a student, and on the free tier.
CREATE OR REPLACE FUNCTION public.is_tier_limited(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tcfg('limits_live') = 1
     AND EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = p_user AND p.role = 'student' AND p.subscription_tier = 'free');
$$;

-- One row per question a limited student has had revealed, per Trinidad day.
CREATE TABLE IF NOT EXISTS public.practice_reveals (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, question_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_reveals_q ON public.practice_reveals(user_id, question_id, revealed_at);
ALTER TABLE public.practice_reveals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "practice_reveals: own read" ON public.practice_reveals;
CREATE POLICY "practice_reveals: own read" ON public.practice_reveals FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.practice_reveals FROM anon, authenticated;
GRANT SELECT ON public.practice_reveals TO authenticated;

-- What the caller has left today. limit/used/remaining are null when they are not limited.
CREATE OR REPLACE FUNCTION public.practice_allowance()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  UUID := auth.uid();
  lim  INT;
  used INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_tier_limited(uid) THEN
    RETURN jsonb_build_object('limited', false, 'limit', NULL, 'used', NULL, 'remaining', NULL,
                              'mock_exams', true);
  END IF;
  lim := public.tcfg('free_practice_per_day')::int;
  SELECT count(*) INTO used FROM public.practice_reveals WHERE user_id = uid AND day = public.local_date(now());
  RETURN jsonb_build_object('limited', true, 'limit', lim, 'used', used, 'remaining', GREATEST(0, lim - used),
                            'mock_exams', public.tcfg('free_mock_exams') = 1);
END;
$$;

-- Called just before a practice answer is revealed. Returns {allowed, ...allowance}. A limited student's reveal is
-- recorded; one already revealed today is allowed again without counting twice.
CREATE OR REPLACE FUNCTION public.claim_practice_reveal(p_question UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid   UUID := auth.uid();
  today DATE := public.local_date(now());
  lim   INT;
  used  INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_tier_limited(uid) THEN
    RETURN jsonb_build_object('allowed', true, 'limited', false);
  END IF;
  -- One claim at a time per student, so two tabs can't both take the last question.
  PERFORM pg_advisory_xact_lock(hashtext('practice_reveal:' || uid::text));
  lim := public.tcfg('free_practice_per_day')::int;
  IF EXISTS (SELECT 1 FROM public.practice_reveals WHERE user_id = uid AND day = today AND question_id = p_question) THEN
    SELECT count(*) INTO used FROM public.practice_reveals WHERE user_id = uid AND day = today;
    RETURN jsonb_build_object('allowed', true, 'limited', true, 'limit', lim, 'used', used, 'remaining', GREATEST(0, lim - used));
  END IF;
  SELECT count(*) INTO used FROM public.practice_reveals WHERE user_id = uid AND day = today;
  IF used >= lim THEN
    RETURN jsonb_build_object('allowed', false, 'limited', true, 'limit', lim, 'used', used, 'remaining', 0);
  END IF;
  INSERT INTO public.practice_reveals (user_id, day, question_id) VALUES (uid, today, p_question);
  RETURN jsonb_build_object('allowed', true, 'limited', true, 'limit', lim, 'used', used + 1, 'remaining', lim - used - 1);
END;
$$;

REVOKE ALL ON FUNCTION public.tcfg(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_tier_limited(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tcfg(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_tier_limited(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.practice_allowance() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_practice_reveal(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_allowance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_practice_reveal(UUID) TO authenticated;

-- ── Enforcement in the database, so no app path can skip it ─────────────────────────────────────────────────────────

-- Mock exams: covers solo starts, and group starts (start_exam_group inserts a session per member).
CREATE OR REPLACE FUNCTION public.enforce_free_tier_mock()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_tier_limited(NEW.student_id) AND public.tcfg('free_mock_exams') <> 1 THEN
    RAISE EXCEPTION 'Mock exams are part of a paid plan. Upgrade to sit one.' USING ERRCODE = 'P0001', HINT = 'free_tier';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_free_tier_mock_sessions ON public.mock_exam_sessions;
CREATE TRIGGER trg_free_tier_mock_sessions BEFORE INSERT ON public.mock_exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_mock();
-- Group membership too (create, join, teacher assign), so a free student can't sit in a lobby and then make the
-- group's start fail for everyone.
DROP TRIGGER IF EXISTS trg_free_tier_group_members ON public.exam_group_members;
CREATE TRIGGER trg_free_tier_group_members BEFORE INSERT ON public.exam_group_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_mock();

-- Practice answers recorded for XP (ranking v2, record_practice_answers): a limited student may only record answers
-- to questions revealed to them in the last day, so XP can't be farmed past the daily limit by posting answers directly.
CREATE OR REPLACE FUNCTION public.enforce_free_tier_practice()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source = 'practice' AND public.is_tier_limited(NEW.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.practice_reveals r
                      WHERE r.user_id = NEW.user_id AND r.question_id = NEW.question_id
                        AND r.revealed_at > now() - interval '1 day') THEN
    RAISE EXCEPTION 'That question is past today''s free practice limit.' USING ERRCODE = 'P0001', HINT = 'free_tier';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_free_tier_practice_attempts ON public.question_attempts;
CREATE TRIGGER trg_free_tier_practice_attempts BEFORE INSERT ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_practice();

REVOKE ALL ON FUNCTION public.enforce_free_tier_mock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_free_tier_practice() FROM PUBLIC, anon, authenticated;
