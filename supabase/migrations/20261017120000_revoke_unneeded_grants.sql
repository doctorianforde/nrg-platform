-- Defence in depth: take away table privileges `anon` and `authenticated` never legitimately use (T34 finding #2).
--
-- Supabase's default privileges give both API roles ALL on every new public table, so RLS has been the only thing
-- stopping misuse. This migration leaves RLS exactly as it is and removes only privileges that RLS refuses anyway, so
-- no request that works today stops working. Visible change: a refused write now fails with 42501 (HTTP 401/403)
-- instead of quietly affecting 0 rows.
--
--   1. anon, authenticated: TRUNCATE, TRIGGER, REFERENCES, MAINTAIN on every public table (TRUNCATE ignores RLS).
--   2. anon: INSERT, UPDATE, DELETE on every public table, and every privilege on public sequences. Nothing writes with
--      the anon key: sign-up goes through GoTrue, and handle_new_user (SECURITY DEFINER) creates the profile.
--   3. authenticated: INSERT / UPDATE / DELETE on each RLS-enabled table where NO permissive policy for authenticated
--      (or public) covers that verb (cmd = the verb or ALL). Derived from pg_policies when this runs, not hard-coded,
--      so it is right on prod even if prod's table set differs. On staging (2026-10-17) that is:
--        case_attempt_responses I/U/D · case_attempts I/U · exam_group_members I/U/D · exam_groups I/U ·
--        profiles I/D · question_attempts I/U/D · the snapshot tables below I/U/D · migration_log I/U/D
--      (practice_sessions, promotion_*, rank_levels, role_requests, topic_weak_marks, user_badges, xp_shadow,
--      badge_definitions, ranking_config already had no table-level write grants.) Every write the app makes with a
--      user token (src/: mock sessions/responses, mock sets, set questions, case_studies, questions/options, messages,
--      threads, profiles, calendar events/audience) has a policy, so it keeps its grant; group join, case answers,
--      grading and awards run through SECURITY DEFINER functions. The end of this file asserts those grants remain.
--   4. authenticated and anon: SELECT on RLS-enabled tables with no SELECT policy at all: the `_backup_*` / `_reset_*`
--      snapshot tables (they hold copies of answer keys and rationales) and migration_log.
--   5. ALTER DEFAULT PRIVILEGES for tables/sequences role postgres creates later in public: no TRUNCATE, TRIGGER,
--      REFERENCES, MAINTAIN for anon/authenticated; no INSERT/UPDATE/DELETE for anon; no sequence privileges for anon.
--      `authenticated` still gets SELECT/INSERT/UPDATE/DELETE on new tables (RLS + policies decide, as today).
--
-- Untouched on purpose:
--   - Column-level grants (20261012170000_hide_answer_keys: SELECT columns on questions / question_options; also
--     question_attempts and xp_events SELECT columns, badge_definitions and ranking_config UPDATE columns). A table-level
--     REVOKE of a verb also removes that verb's column grants, so steps 3-4 skip any table+verb with column grants and
--     never revoke SELECT where a SELECT policy exists; the end of this file asserts every column grant survived.
--   - anon SELECT (no policy gives anon rows, so anon reads already return []; revoking would turn [] into 401 for any
--     page that reads before sign-in). Function EXECUTE grants and the storage schema are out of scope.
--   - service_role and postgres (they bypass RLS; server-side code and migrations).
--   - Default privileges of role supabase_admin (postgres cannot alter them; tables it creates are rare).
--
-- Every privilege revoked by steps 1-4 is recorded in public._grant_hardening_20261017 (no API access).
-- ROLLBACK (exact):
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT * FROM public._grant_hardening_20261017 LOOP
--       EXECUTE format(CASE WHEN r.objtype = 'S' THEN 'GRANT %s ON SEQUENCE public.%I TO %I'
--                           ELSE 'GRANT %s ON TABLE public.%I TO %I' END, r.privilege, r.relname, r.grantee);
--     END LOOP; END $$;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES TO anon, authenticated;
--     (drop MAINTAIN on Postgres < 17)
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon;
--   DROP TABLE public._grant_hardening_20261017;
-- If a later migration adds a write policy for a table/verb revoked here, it must also GRANT that verb to authenticated.

CREATE TABLE IF NOT EXISTS public._grant_hardening_20261017 (
  relname   text   NOT NULL,
  objtype   "char" NOT NULL,  -- 'r' table/view, 'S' sequence
  grantee   text   NOT NULL,
  privilege text   NOT NULL,
  reason    text   NOT NULL,
  PRIMARY KEY (relname, grantee, privilege)
);
ALTER TABLE public._grant_hardening_20261017 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._grant_hardening_20261017 FROM anon, authenticated;

-- Revoke one privilege only if it is granted directly (table-level ACL), and log it.
CREATE FUNCTION pg_temp.hard_revoke(p_rel text, p_kind "char", p_role text, p_priv text, p_reason text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE acl aclitem[];
BEGIN
  SELECT c.relacl INTO acl FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = p_rel;
  IF NOT EXISTS (SELECT 1 FROM aclexplode(acl) x WHERE x.grantee = p_role::regrole AND x.privilege_type = p_priv) THEN
    RETURN;
  END IF;
  EXECUTE format(CASE WHEN p_kind = 'S' THEN 'REVOKE %s ON SEQUENCE public.%I FROM %I'
                      ELSE 'REVOKE %s ON TABLE public.%I FROM %I' END, p_priv, p_rel, p_role);
  INSERT INTO public._grant_hardening_20261017 VALUES (p_rel, p_kind, p_role, p_priv, p_reason) ON CONFLICT DO NOTHING;
END $f$;

DO $$
DECLARE
  t record;
  v text;
  g text;
  cols_before text[];
  cols_after text[];
  has_policy boolean;
  has_colgrant boolean;
  w record;
BEGIN
  SELECT array_agg(c.relname || '.' || a.attname || '=' || a.attacl::text ORDER BY c.relname, a.attname) INTO cols_before
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL;

  FOR t IN
    SELECT c.oid, c.relname, c.relkind, c.relrowsecurity
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
       AND c.relname <> '_grant_hardening_20261017'
     ORDER BY c.relname
  LOOP
    -- 1. never needed by either API role
    FOREACH g IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH v IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'] LOOP
        PERFORM pg_temp.hard_revoke(t.relname, 'r', g, v, 'never needed by API roles');
      END LOOP;
    END LOOP;
    -- 2. anon never writes
    FOREACH v IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      PERFORM pg_temp.hard_revoke(t.relname, 'r', 'anon', v, 'anon never writes');
    END LOOP;
    -- 3 + 4. authenticated: verbs no policy permits
    IF t.relkind IN ('r','p') THEN
      IF NOT t.relrowsecurity THEN
        RAISE NOTICE 'grant hardening: % has RLS off; authenticated privileges left as they are', t.relname;
        CONTINUE;
      END IF;
      FOREACH v IN ARRAY ARRAY['INSERT','UPDATE','DELETE','SELECT'] LOOP
        SELECT EXISTS (
          SELECT 1 FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = t.relname AND p.permissive = 'PERMISSIVE'
             AND p.cmd IN (v, 'ALL') AND p.roles && ARRAY['authenticated','public']::name[]
        ) INTO has_policy;
        SELECT EXISTS (
          SELECT 1 FROM pg_attribute a, aclexplode(a.attacl) x
           WHERE a.attrelid = t.oid AND a.attacl IS NOT NULL
             AND x.grantee = 'authenticated'::regrole AND x.privilege_type = v
        ) INTO has_colgrant;
        IF NOT has_policy AND NOT has_colgrant THEN
          PERFORM pg_temp.hard_revoke(t.relname, 'r', 'authenticated', v, 'no permissive ' || v || ' policy');
        END IF;
        -- A table nobody may read (no SELECT policy for any role): anon loses SELECT too.
        IF v = 'SELECT' AND NOT has_policy AND NOT EXISTS (
          SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.relname AND p.cmd IN ('SELECT','ALL')
        ) THEN
          PERFORM pg_temp.hard_revoke(t.relname, 'r', 'anon', 'SELECT', 'no SELECT policy for any role');
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 2 (sequences). anon never inserts, so it never needs nextval.
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S' LOOP
    FOREACH v IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
      PERFORM pg_temp.hard_revoke(t.relname, 'S', 'anon', v, 'anon never writes');
    END LOOP;
  END LOOP;

  -- Column grants must be exactly as before.
  SELECT array_agg(c.relname || '.' || a.attname || '=' || a.attacl::text ORDER BY c.relname, a.attname) INTO cols_after
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL;
  IF cols_after IS DISTINCT FROM cols_before THEN
    RAISE EXCEPTION 'grant hardening would change column-level grants; aborting';
  END IF;

  -- Every write the app makes with a user token must still be granted.
  FOR w IN SELECT * FROM (VALUES
      ('mock_exam_sessions','INSERT'), ('mock_exam_responses','INSERT'), ('mock_exam_responses','UPDATE'),
      ('mock_exam_sets','INSERT'), ('mock_exam_sets','UPDATE'), ('mock_exam_set_questions','INSERT'),
      ('mock_exam_set_questions','DELETE'), ('case_studies','UPDATE'), ('questions','INSERT'), ('questions','UPDATE'),
      ('questions','DELETE'), ('question_options','INSERT'), ('question_options','UPDATE'),
      ('message_threads','INSERT'), ('message_threads','DELETE'), ('messages','INSERT'), ('profiles','UPDATE'),
      ('calendar_events','INSERT'), ('calendar_events','UPDATE'), ('calendar_events','DELETE'),
      ('calendar_event_audience','INSERT'), ('calendar_event_audience','DELETE')) AS x(tbl, priv)
  LOOP
    IF to_regclass('public.' || w.tbl) IS NOT NULL
       AND NOT has_table_privilege('authenticated', ('public.' || w.tbl)::regclass, w.priv) THEN
      RAISE EXCEPTION 'grant hardening would remove % on % from authenticated (an app write path); aborting', w.priv, w.tbl;
    END IF;
  END LOOP;
END $$;

-- 5. Future tables and sequences created by postgres (migrations, SQL editor).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
DO $$ BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN  -- MAINTAIN exists from Postgres 17
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM anon, authenticated';
  END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
