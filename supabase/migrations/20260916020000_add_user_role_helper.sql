-- T11: user_role() helper for RLS policies
-- Avoids N+1 profile lookups — every RLS policy calls this to get the caller's role.
--
-- SECURITY DEFINER: runs as the defining user (postgres), so it can read
-- public.profiles even when the caller (anon/authenticated) has no direct SELECT.
-- STABLE: result won't change within a single statement, so the planner can
-- cache it across multiple policy evaluations in one query.
-- search_path is pinned to prevent schema-hijacking of the SECURITY DEFINER body.
--
-- NOTE: the task spec suggested placing this in the auth schema. On hosted
-- Supabase the auth schema is owned by supabase_auth_admin and the migration
-- role (postgres) has only USAGE there — CREATE FUNCTION auth.user_role()
-- fails with "permission denied for schema auth" via `supabase db push`.
-- It therefore lives in public, prefixed to make its purpose unambiguous.
-- All RLS policies must call public.user_role().

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM   public.profiles
  WHERE  id = auth.uid()
$$;
