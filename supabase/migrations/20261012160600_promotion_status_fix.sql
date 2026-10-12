-- Ranking v2: promotion_status declared a variable named `passed`, which clashes with promotion_attempts.passed
-- ("column reference is ambiguous"). Renamed to v_passed; behaviour otherwise unchanged.
CREATE OR REPLACE FUNCTION public.promotion_status(p_user UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid      UUID := COALESCE(p_user, auth.uid());
  xp       BIGINT;
  xl       INT;
  v_passed INT;
  open_id  UUID;
  last_fail TIMESTAMPTZ;
  retake_at TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF uid <> auth.uid() AND NOT public.is_teaching_staff() THEN RAISE EXCEPTION 'not yours' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO xp FROM public.xp_events WHERE user_id = uid;
  xl := public.xp_level(xp);
  v_passed := public.promotion_passed_level(uid);
  SELECT id INTO open_id FROM public.promotion_attempts WHERE user_id = uid AND finished_at IS NULL;
  SELECT max(finished_at) INTO last_fail FROM public.promotion_attempts
   WHERE user_id = uid AND target_level = v_passed + 1 AND passed IS FALSE;
  retake_at := last_fail + make_interval(hours => public.rcfg('promo_retake_hours')::int);
  RETURN jsonb_build_object(
    'xp', xp,
    'xp_level', xl,
    'passed_level', v_passed,
    'rank_level', LEAST(v_passed, xl),
    'next_level', CASE WHEN v_passed < 24 THEN v_passed + 1 END,
    'next_level_min_xp', (SELECT min_xp FROM public.rank_levels WHERE level = v_passed + 1),
    'eligible', v_passed < 24 AND xl > v_passed,
    'open_attempt_id', open_id,
    'retake_available_at', CASE WHEN retake_at > now() THEN retake_at END);
END;
$$;
REVOKE ALL ON FUNCTION public.promotion_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_status(UUID) TO authenticated;
