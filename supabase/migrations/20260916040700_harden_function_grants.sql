-- Harden function grants (Supabase security advisor, post-T38)
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which means
-- anon could call every SECURITY DEFINER helper via /rest/v1/rpc/*. Lock each
-- function down to exactly who needs it:
--   * RLS helpers → authenticated (policies run as that role) + service_role
--   * RPCs the app calls → authenticated + service_role
--   * trigger functions → nobody (EXECUTE is only checked at CREATE TRIGGER time)

-- Pin search_path on the T09 trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- RLS helpers
REVOKE ALL ON FUNCTION public.user_role()                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_question(UUID)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_role()                TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_admin()                 TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.can_manage_question(UUID)  TO authenticated, service_role;

-- App RPCs
REVOKE ALL ON FUNCTION public.complete_mock_exam_session(UUID)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_mock_exam_questions(UUID, TEXT)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_mock_exam_session(UUID)       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.search_mock_exam_questions(UUID, TEXT) TO authenticated, service_role;

-- Trigger functions: never callable directly
REVOKE ALL ON FUNCTION public.set_updated_at()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_columns()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grade_mock_exam_response()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_rationale_release()             FROM PUBLIC, anon, authenticated;

-- Make future functions default to locked-down as well
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
