-- Teacher sign-up approval, platform admins, and account management.
--
-- Self-service signup still only ever grants 'student'. Choosing "teacher" on the
-- form records a REQUEST; an admin turns it into a role. The role itself is never
-- settable from the browser — protect_profile_privileged_columns (T12) already
-- blocks that, and decide_role_request() is the only approved path.

-- ─────────────────────────────────────────────────────────────────────────────
-- Platform admins: bootstrap on signup + who gets notified
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_contacts (
  email      TEXT PRIMARY KEY CHECK (email = lower(btrim(email))),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_contacts IS
  'Two jobs: an address here is promoted to super_admin when it signs up, and is a recipient of teacher-request notifications.';

INSERT INTO public.admin_contacts (email, note) VALUES
  ('doctorianforde@gmail.com', 'Ian Forde — developer'),
  ('jadenicome1@gmail.com',    'Jade Nicome — client')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.admin_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_contacts: admin read"
  ON public.admin_contacts FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin_contacts: super_admin write"
  ON public.admin_contacts FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');
REVOKE ALL ON public.admin_contacts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_contacts TO authenticated;

-- Promote the account that already exists. Runs as postgres, so the privilege
-- guard's auth.uid() IS NULL path lets it through.
UPDATE public.profiles p
   SET role = 'super_admin'
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) IN (SELECT email FROM public.admin_contacts)
   AND p.role <> 'super_admin';

-- ─────────────────────────────────────────────────────────────────────────────
-- Suspension
-- ─────────────────────────────────────────────────────────────────────────────
-- Set alongside an auth-level ban. The ban is what actually stops a sign-in; this
-- column is what the app and the admin screen read, without listing auth users.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- Role requests
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('teacher')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','denied')),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at     TIMESTAMPTZ
);
-- At most one open request per person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rr_one_pending
  ON public.role_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rr_status ON public.role_requests(status, created_at DESC);

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_requests: own or admin read"
  ON public.role_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
-- No INSERT/UPDATE policy: rows are created by the signup trigger and decided
-- only through decide_role_request().
REVOKE ALL ON public.role_requests FROM anon, authenticated;
GRANT SELECT ON public.role_requests TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Signup: record a teacher request, bootstrap a platform admin
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wants      TEXT := NULLIF(NEW.raw_user_meta_data->>'requested_role', '');
  is_contact BOOLEAN := EXISTS (
    SELECT 1 FROM public.admin_contacts c WHERE c.email = lower(NEW.email)
  );
BEGIN
  INSERT INTO public.profiles (id, role, subscription_tier, full_name)
  VALUES (
    NEW.id,
    CASE WHEN is_contact THEN 'super_admin' ELSE 'student' END,
    'free',
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- A request, never a role. Platform admins skip it — they already outrank it.
  IF wants = 'teacher' AND NOT is_contact THEN
    INSERT INTO public.role_requests (user_id, requested_role)
    VALUES (NEW.id, 'teacher')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Deciding a request — the only path from a request to a role
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_role_request(
  p_request_id UUID,
  p_approve    BOOLEAN,
  p_note       TEXT DEFAULT NULL
)
RETURNS public.role_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.role_requests;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'only an admin may decide role requests' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req FROM public.role_requests WHERE id = p_request_id FOR UPDATE;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already decided' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    UPDATE public.profiles SET role = req.requested_role WHERE id = req.user_id;
  END IF;

  UPDATE public.role_requests
     SET status     = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         note       = p_note,
         decided_by = auth.uid(),
         decided_at = now()
   WHERE id = p_request_id
  RETURNING * INTO req;

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_role_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_role_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Deleting an account: what follows it, and what survives it
-- ─────────────────────────────────────────────────────────────────────────────
-- Personal history goes with the person; authored content stays, unattributed.
-- mock_exam_sets.created_by is intentionally left alone (NOT NULL): an account
-- that owns exam sets cannot be deleted until they are reassigned, and the admin
-- screen says so rather than quietly destroying a paper other students sat.
ALTER TABLE public.mock_exam_sessions
  DROP CONSTRAINT IF EXISTS mock_exam_sessions_student_id_fkey,
  ADD  CONSTRAINT mock_exam_sessions_student_id_fkey
       FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_author_id_fkey,
  ADD  CONSTRAINT messages_author_id_fkey
       FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_created_by_fkey,
  ADD  CONSTRAINT questions_created_by_fkey
       FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
