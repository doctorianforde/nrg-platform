-- One signed-in device per student, newest sign-in wins (Ian, 2026-11-09: guardrail against account sharing).
--
-- The rule: a student's current session must be the most recently created of their sessions (auth.sessions). Signing
-- in on a new device creates a newer session, so the older device fails this check on its next page load; the
-- middleware then signs it out with an explanation. The login page also revokes the student's other sessions at once
-- (end_other_sessions(), which logs the bumps and kills their refresh tokens); session_is_current() is the backstop for sign-ins that skip
-- our login page (a direct API sign-in still creates a newer session, so it still wins and the old one still loses).
--
-- Staff (teacher, admin, super admin) are never affected. Tokens without a session claim are allowed.
-- Each bump is logged once per bumped session in student_session_bumps, for the admin "looks shared" list (later).
--
-- Additive: one table, three functions. ROLLBACK: DROP FUNCTION public.session_is_current(); DROP FUNCTION public.end_other_sessions();
-- DROP FUNCTION public.session_was_bumped(UUID); DROP TABLE public.student_session_bumps;
-- The app tolerates the function's absence (the middleware treats an error as "current").

CREATE TABLE IF NOT EXISTS public.student_session_bumps (
  session_id UUID PRIMARY KEY,                 -- the session that was signed out (one row each)
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bumped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_session_bumps_user_time ON public.student_session_bumps (user_id, bumped_at DESC);

ALTER TABLE public.student_session_bumps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_session_bumps: staff read" ON public.student_session_bumps;
CREATE POLICY "student_session_bumps: staff read" ON public.student_session_bumps
  FOR SELECT TO authenticated USING (public.is_teaching_staff());
REVOKE ALL ON public.student_session_bumps FROM anon, authenticated;
GRANT SELECT ON public.student_session_bumps TO authenticated;

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
    RETURN TRUE;   -- staff may stay signed in on several devices
  END IF;

  sid := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF sid IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT s.created_at INTO created FROM auth.sessions s WHERE s.id = sid AND s.user_id = uid;
  IF created IS NULL                                  -- this session was revoked
     OR EXISTS (SELECT 1 FROM auth.sessions s
                 WHERE s.user_id = uid AND s.id <> sid AND s.created_at > created) THEN
    INSERT INTO public.student_session_bumps (session_id, user_id) VALUES (sid, uid)
      ON CONFLICT (session_id) DO NOTHING;
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.session_is_current() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_is_current() TO authenticated;

-- Called by the login page right after a student signs in: log every other session of theirs as bumped, then end it
-- (deleting the auth.sessions row revokes its refresh tokens). Staff: no-op. Returns how many sessions were ended.
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
  INSERT INTO public.student_session_bumps (session_id, user_id)
    SELECT s.id, uid FROM auth.sessions s WHERE s.user_id = uid AND s.id <> sid
    ON CONFLICT (session_id) DO NOTHING;
  DELETE FROM auth.sessions s WHERE s.user_id = uid AND s.id <> sid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.end_other_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_other_sessions() TO authenticated;

-- For the middleware's message only: was this (now gone) session ended by a newer sign-in? A yes/no about a session id
-- the caller already holds; callable without a valid session because the session is already gone.
CREATE OR REPLACE FUNCTION public.session_was_bumped(p_session UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.student_session_bumps WHERE session_id = p_session) $$;
REVOKE ALL ON FUNCTION public.session_was_bumped(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_was_bumped(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.session_is_current() IS
  'One device per student (2026-11-09): false when the caller is a student and this session is not their newest (or was '
  'revoked); logs the bump once. Staff and session-less tokens always true.';
