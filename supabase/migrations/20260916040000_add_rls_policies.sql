-- T12: Row Level Security for all Phase 1 tables
-- Role helper: public.user_role() (T11 — lives in public, not auth; see that migration).
-- All policies are scoped TO authenticated, so anon/unauthenticated requests get nothing.
-- The postgres role (migrations, SQL editor) and service_role bypass RLS entirely.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- True when the caller is admin or super_admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_role() IN ('admin','super_admin')
$$;

-- True when the caller may edit a given question:
--   admin/super_admin → any question; teacher → only questions they created.
-- Used by question_options / question_tags so they follow their parent row.
CREATE OR REPLACE FUNCTION public.can_manage_question(q_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (public.user_role() = 'teacher'
          AND EXISTS (SELECT 1 FROM public.questions q
                      WHERE q.id = q_id AND q.created_by = auth.uid()))
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: read own or admin any"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- No INSERT policy on purpose: rows are created only by the signup trigger
-- (T18, SECURITY DEFINER, runs as postgres which bypasses RLS).

CREATE POLICY "profiles: update own or admin any"
  ON public.profiles FOR UPDATE TO authenticated
  USING      (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- No DELETE policy: profiles are removed via auth.users ON DELETE CASCADE only.

-- Column guard: only admins may change role / subscription_tier, and only a
-- super_admin may grant super_admin. auth.uid() IS NULL = service role / SQL
-- editor / Stripe webhook (Phase 2), which is always allowed.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  caller_role TEXT := public.user_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier)
     AND caller_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'only admins may change role or subscription_tier'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin'
     AND caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'only a super_admin may grant super_admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_protect_privileged
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ─────────────────────────────────────────────────────────────────────────────
-- Reference data: domains, topics, tags
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domains: authenticated read"
  ON public.domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "domains: admin write"
  ON public.domains FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "topics: authenticated read"
  ON public.topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "topics: admin write"
  ON public.topics FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "tags: authenticated read"
  ON public.tags FOR SELECT TO authenticated USING (true);
-- Teachers may add tags while authoring questions; only admins edit/remove them.
CREATE POLICY "tags: teacher+ insert"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('teacher','admin','super_admin'));
CREATE POLICY "tags: admin update"
  ON public.tags FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "tags: admin delete"
  ON public.tags FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- questions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Students read all questions; the is_active filter is applied at the app layer.
CREATE POLICY "questions: authenticated read"
  ON public.questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "questions: teacher+ insert"
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.user_role() = 'teacher' AND created_by = auth.uid())
  );

CREATE POLICY "questions: teacher own or admin any update"
  ON public.questions FOR UPDATE TO authenticated
  USING      (public.can_manage_question(id))
  WITH CHECK (public.can_manage_question(id));

-- Hard delete is admin-only; prefer soft delete (is_active = false) via UPDATE.
CREATE POLICY "questions: admin delete"
  ON public.questions FOR DELETE TO authenticated
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- question_options, question_tags — follow the parent question
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_tags    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_options: authenticated read"
  ON public.question_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "question_options: follow parent question"
  ON public.question_options FOR ALL TO authenticated
  USING      (public.can_manage_question(question_id))
  WITH CHECK (public.can_manage_question(question_id));

CREATE POLICY "question_tags: authenticated read"
  ON public.question_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "question_tags: follow parent question"
  ON public.question_tags FOR ALL TO authenticated
  USING      (public.can_manage_question(question_id))
  WITH CHECK (public.can_manage_question(question_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Study content: flashcards, case_studies, case_study_questions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.flashcards           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_studies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_study_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flashcards: authenticated read"
  ON public.flashcards FOR SELECT TO authenticated USING (true);
CREATE POLICY "flashcards: admin write"
  ON public.flashcards FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "case_studies: authenticated read"
  ON public.case_studies FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_studies: admin write"
  ON public.case_studies FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "case_study_questions: authenticated read"
  ON public.case_study_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "case_study_questions: admin write"
  ON public.case_study_questions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Note on "FOR ALL" policies: Postgres applies USING to SELECT/UPDATE/DELETE and
-- WITH CHECK to INSERT/UPDATE. The separate permissive "authenticated read"
-- policy on each table means non-admins can still SELECT (policies are OR-ed).
