-- Admin "looks shared" list (Ian, 2026-11-09: thresholds 5 sign-outs in a day or 4 devices in a week, adjustable later).
--
-- Builds on 20261109140000 (one device per student). Adds:
--   account_guard_config  the two thresholds, editable by admins from /admin/sharing
--   student_sign_ins      one row per student session, copied from auth.sessions when first seen (auth.sessions rows
--                         are deleted when a device is bumped, so the history needs its own log): browser string, IP, time
--   sharing_reviews       an admin's "reviewed" mark; a reviewed account only flags again on activity after the mark
--   shared_account_signals()          admin only: students with recent activity, their counts, whether they are flagged
--   mark_sharing_reviewed(), set_account_guard_config()   admin only
-- and re-creates session_is_current() / end_other_sessions() so they record sign-ins (same behaviour otherwise).
--
-- Flags are for a person to review; nothing here suspends anyone. Additive. ROLLBACK: drop the three functions named
-- above and the three tables, then re-run 20261109140000 to restore the two functions without sign-in recording.

CREATE TABLE IF NOT EXISTS public.account_guard_config (
  key        TEXT PRIMARY KEY,
  value      NUMERIC NOT NULL CHECK (value > 0),
  note       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.account_guard_config (key, value, note) VALUES
  ('bumps_per_day',    5, 'Flag a student signed out by a newer sign-in this many times in one Trinidad day (Ian, 2026-11-09)'),
  ('devices_per_week', 4, 'Flag a student signing in from this many different browsers in the last 7 days (Ian, 2026-11-09)')
ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.account_guard_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_guard_config: admin read" ON public.account_guard_config;
CREATE POLICY "account_guard_config: admin read" ON public.account_guard_config FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.account_guard_config FROM anon, authenticated;
GRANT SELECT ON public.account_guard_config TO authenticated;

CREATE TABLE IF NOT EXISTS public.student_sign_ins (
  session_id   UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_agent   TEXT,
  ip           INET,
  signed_in_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sign_ins_user_time ON public.student_sign_ins (user_id, signed_in_at DESC);
ALTER TABLE public.student_sign_ins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_sign_ins: admin read" ON public.student_sign_ins;
CREATE POLICY "student_sign_ins: admin read" ON public.student_sign_ins FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.student_sign_ins FROM anon, authenticated;
GRANT SELECT ON public.student_sign_ins TO authenticated;

CREATE TABLE IF NOT EXISTS public.sharing_reviews (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note        TEXT
);
ALTER TABLE public.sharing_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sharing_reviews: admin read" ON public.sharing_reviews;
CREATE POLICY "sharing_reviews: admin read" ON public.sharing_reviews FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.sharing_reviews FROM anon, authenticated;
GRANT SELECT ON public.sharing_reviews TO authenticated;

-- Copy a session's browser and IP into the log the first time it is seen.
CREATE OR REPLACE FUNCTION public.record_student_sign_in(p_user UUID, p_session UUID)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.student_sign_ins (session_id, user_id, user_agent, ip, signed_in_at)
  SELECT s.id, s.user_id, s.user_agent, s.ip, s.created_at FROM auth.sessions s
   WHERE s.id = p_session AND s.user_id = p_user
  ON CONFLICT (session_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.record_student_sign_in(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Same as 20261109140000, plus: record the sign-in the first time a current student session is seen.
CREATE OR REPLACE FUNCTION public.session_is_current()
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  sid     UUID;
  created TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RETURN TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'student') THEN
    RETURN TRUE;
  END IF;
  sid := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF sid IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT s.created_at INTO created FROM auth.sessions s WHERE s.id = sid AND s.user_id = uid;
  IF created IS NULL
     OR EXISTS (SELECT 1 FROM auth.sessions s
                 WHERE s.user_id = uid AND s.id <> sid AND s.created_at > created) THEN
    INSERT INTO public.student_session_bumps (session_id, user_id) VALUES (sid, uid)
      ON CONFLICT (session_id) DO NOTHING;
    RETURN FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_sign_ins WHERE session_id = sid) THEN
    PERFORM public.record_student_sign_in(uid, sid);
  END IF;
  RETURN TRUE;
END;
$$;

-- Same as 20261109140000, plus: record this sign-in and the ones being ended (they may never have loaded a page).
CREATE OR REPLACE FUNCTION public.end_other_sessions()
RETURNS INT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  sid UUID := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  n   INT;
BEGIN
  IF uid IS NULL OR sid IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'student') THEN
    RETURN 0;
  END IF;
  INSERT INTO public.student_sign_ins (session_id, user_id, user_agent, ip, signed_in_at)
    SELECT s.id, s.user_id, s.user_agent, s.ip, s.created_at FROM auth.sessions s WHERE s.user_id = uid
    ON CONFLICT (session_id) DO NOTHING;
  INSERT INTO public.student_session_bumps (session_id, user_id)
    SELECT s.id, uid FROM auth.sessions s WHERE s.user_id = uid AND s.id <> sid
    ON CONFLICT (session_id) DO NOTHING;
  DELETE FROM auth.sessions s WHERE s.user_id = uid AND s.id <> sid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Admin list: every student with sign-in or bump activity in the last 14 days, flagged first.
CREATE OR REPLACE FUNCTION public.shared_account_signals()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bumps_cfg   NUMERIC;
  devices_cfg NUMERIC;
  result      JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  SELECT value INTO bumps_cfg FROM public.account_guard_config WHERE key = 'bumps_per_day';
  SELECT value INTO devices_cfg FROM public.account_guard_config WHERE key = 'devices_per_week';

  WITH active AS (
    SELECT user_id FROM public.student_sign_ins WHERE signed_in_at > now() - interval '14 days'
    UNION
    SELECT user_id FROM public.student_session_bumps WHERE bumped_at > now() - interval '14 days'
  ), per AS (
    SELECT a.user_id,
           r.reviewed_at,
           -- counts only look at activity after an admin's review mark
           (SELECT COALESCE(max(n), 0) FROM (
              SELECT count(*) n FROM public.student_session_bumps b
               WHERE b.user_id = a.user_id AND b.bumped_at > now() - interval '14 days'
                 AND (r.reviewed_at IS NULL OR b.bumped_at > r.reviewed_at)
               GROUP BY public.local_date(b.bumped_at)) d) AS max_bumps_day,
           (SELECT count(*) FROM public.student_session_bumps b
             WHERE b.user_id = a.user_id AND public.local_date(b.bumped_at) = public.local_date(now())) AS bumps_today,
           (SELECT count(DISTINCT COALESCE(s.user_agent, '')) FROM public.student_sign_ins s
             WHERE s.user_id = a.user_id AND s.signed_in_at > now() - interval '7 days'
               AND (r.reviewed_at IS NULL OR s.signed_in_at > r.reviewed_at)) AS devices_7d,
           (SELECT count(*) FROM public.student_sign_ins s
             WHERE s.user_id = a.user_id AND s.signed_in_at > now() - interval '7 days') AS sign_ins_7d,
           GREATEST((SELECT max(signed_in_at) FROM public.student_sign_ins s WHERE s.user_id = a.user_id),
                    (SELECT max(bumped_at) FROM public.student_session_bumps b WHERE b.user_id = a.user_id)) AS last_activity
      FROM active a
      LEFT JOIN public.sharing_reviews r ON r.user_id = a.user_id
  )
  SELECT jsonb_build_object(
    'bumps_per_day', bumps_cfg,
    'devices_per_week', devices_cfg,
    'students', COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', p.user_id,
      'name', pr.full_name,
      'email', u.email,
      'plan', pr.subscription_tier,
      'suspended', pr.suspended_at IS NOT NULL,
      'max_bumps_day', p.max_bumps_day,
      'bumps_today', p.bumps_today,
      'devices_7d', p.devices_7d,
      'sign_ins_7d', p.sign_ins_7d,
      'last_activity', p.last_activity,
      'reviewed_at', p.reviewed_at,
      'review_note', (SELECT note FROM public.sharing_reviews WHERE user_id = p.user_id),
      'flagged', p.max_bumps_day >= bumps_cfg OR p.devices_7d >= devices_cfg,
      'recent', (SELECT COALESCE(jsonb_agg(jsonb_build_object('at', x.signed_in_at, 'user_agent', x.user_agent, 'ip', host(x.ip)) ORDER BY x.signed_in_at DESC), '[]'::jsonb)
                   FROM (SELECT * FROM public.student_sign_ins s WHERE s.user_id = p.user_id ORDER BY s.signed_in_at DESC LIMIT 8) x)
    ) ORDER BY (p.max_bumps_day >= bumps_cfg OR p.devices_7d >= devices_cfg) DESC, p.last_activity DESC), '[]'::jsonb)
  ) INTO result
  FROM per p
  JOIN public.profiles pr ON pr.id = p.user_id AND pr.role = 'student'
  LEFT JOIN auth.users u ON u.id = p.user_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.shared_account_signals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_account_signals() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_sharing_reviewed(p_user UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.sharing_reviews (user_id, reviewed_at, reviewed_by, note)
  VALUES (p_user, now(), auth.uid(), NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''))
  ON CONFLICT (user_id) DO UPDATE SET reviewed_at = now(), reviewed_by = auth.uid(), note = EXCLUDED.note;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_sharing_reviewed(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sharing_reviewed(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_account_guard_config(p_key TEXT, p_value NUMERIC)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  IF p_value IS NULL OR p_value < 1 OR p_value > 100 OR p_value <> round(p_value) THEN
    RAISE EXCEPTION 'threshold must be a whole number from 1 to 100' USING ERRCODE = '22023';
  END IF;
  UPDATE public.account_guard_config SET value = p_value, updated_at = now(), updated_by = auth.uid() WHERE key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown setting %', p_key USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_account_guard_config(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_guard_config(TEXT, NUMERIC) TO authenticated;
