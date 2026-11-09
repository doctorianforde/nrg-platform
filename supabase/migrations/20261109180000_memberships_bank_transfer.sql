-- Paid plans by bank transfer (Ian, 2026-11-09). Build plan: Claude Doc "NRG Membership by Bank Transfer: Build Plan".
-- Students pay into NRG's Trinidad account, upload the receipt, and an admin approves it after finding the payment on
-- the bank statement. Plans: Free, 1 month (TT$200), 3 months (TT$500). The US$ prices (29 / 69) are stored for card
-- payment later and not shown yet. Rule numbers (R1–R14) refer to the build plan.
--
-- Access: effective_tier(user) = 'premium' while a membership is active and unexpired (R1), else the profile's own plan
-- (so admin "Set plan" keeps working for comps). Approval never writes profiles.subscription_tier: that is the fallback,
-- and copying 'premium' there would outlive the expiry. is_tier_limited() and start_case_attempt() now use it, and the
-- app reads it through the computed column profiles.effective_plan.
--
-- Additive except two CREATE OR REPLACE (is_tier_limited, start_case_attempt), whose only change is the tier lookup.
-- ROLLBACK: restore those two from 20261022120000 / 20261009003423, drop the new functions, tables, policies and bucket.

-- ── Plans and settings ────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.membership_plans (
  code             TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9_]+$'),
  name             TEXT NOT NULL,
  months           INT NOT NULL CHECK (months BETWEEN 1 AND 24),
  price_ttd        NUMERIC(10,2) NOT NULL CHECK (price_ttd > 0),
  online_price_usd NUMERIC(10,2),          -- for card payment later; not shown while paying by bank transfer
  sort_order       INT NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO public.membership_plans (code, name, months, price_ttd, online_price_usd, sort_order) VALUES
  ('one_month',    '1 month',  1, 200, 29, 1),
  ('three_months', '3 months', 3, 500, 69, 2)
ON CONFLICT (code) DO NOTHING;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
-- Two read policies: anon may not execute is_admin(), so it gets the plain one.
DROP POLICY IF EXISTS "membership_plans: read" ON public.membership_plans;
DROP POLICY IF EXISTS "membership_plans: anon read" ON public.membership_plans;
CREATE POLICY "membership_plans: anon read" ON public.membership_plans FOR SELECT TO anon USING (active);
CREATE POLICY "membership_plans: read" ON public.membership_plans FOR SELECT TO authenticated USING (active OR public.is_admin());
DROP POLICY IF EXISTS "membership_plans: admin update" ON public.membership_plans;
CREATE POLICY "membership_plans: admin update" ON public.membership_plans FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.membership_plans FROM anon, authenticated;
GRANT SELECT ON public.membership_plans TO anon, authenticated;
GRANT UPDATE (name, price_ttd, online_price_usd, sort_order, active) ON public.membership_plans TO authenticated;

-- What students see on the plans page. Empty bank details = the pay form says the details are being finalised.
CREATE TABLE IF NOT EXISTS public.membership_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  note  TEXT NOT NULL
);
INSERT INTO public.membership_settings (key, value, note) VALUES
  ('bank_name',       '', 'Bank, e.g. Republic Bank (to be supplied, D30)'),
  ('account_name',    '', 'Account name (to be supplied, D30)'),
  ('account_number',  '', 'Account number (to be supplied, D30)'),
  ('branch',          '', 'Branch, optional'),
  ('reference_hint',  'Your NRG email address', 'What students should write as the payment reference'),
  ('turnaround_days', '2', 'Working days to check a receipt, shown to students (to be confirmed, D30)')
ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.membership_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membership_settings: read" ON public.membership_settings;
CREATE POLICY "membership_settings: read" ON public.membership_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "membership_settings: admin update" ON public.membership_settings;
CREATE POLICY "membership_settings: admin update" ON public.membership_settings FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.membership_settings FROM anon, authenticated;
GRANT SELECT ON public.membership_settings TO anon, authenticated;
GRANT UPDATE (value) ON public.membership_settings TO authenticated;

-- ── Requests, memberships, audit ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.membership_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code        TEXT NOT NULL REFERENCES public.membership_plans(code),
  amount_ttd       NUMERIC(10,2) NOT NULL,             -- the plan's price when submitted (R13)
  paid_on          DATE NOT NULL,
  method           TEXT NOT NULL CHECK (method IN ('bank_transfer', 'online_banking', 'cash_deposit')),
  reference        TEXT NOT NULL CHECK (length(btrim(reference)) BETWEEN 2 AND 100),
  reference_norm   TEXT GENERATED ALWAYS AS (lower(regexp_replace(reference, '[^A-Za-z0-9]', '', 'g'))) STORED,  -- R11
  receipt_path     TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  checklist        JSONB,
  reject_reason    TEXT,
  receipt_check    JSONB,                              -- written by the server right after submission (R11)
  receipt_sha256   TEXT,
  refund_on        DATE,                               -- R14, recorded by an admin
  refund_reference TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_requests_one_pending ON public.membership_requests (user_id) WHERE status = 'pending';  -- R12
CREATE INDEX IF NOT EXISTS idx_membership_requests_status ON public.membership_requests (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_requests_ref ON public.membership_requests (reference_norm);
CREATE INDEX IF NOT EXISTS idx_membership_requests_sha ON public.membership_requests (receipt_sha256);
ALTER TABLE public.membership_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membership_requests: own or admin read" ON public.membership_requests;
CREATE POLICY "membership_requests: own or admin read" ON public.membership_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
REVOKE ALL ON public.membership_requests FROM anon, authenticated;
GRANT SELECT ON public.membership_requests TO authenticated;          -- R2: no insert/update/delete for anyone

CREATE TABLE IF NOT EXISTS public.memberships (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code       TEXT NOT NULL REFERENCES public.membership_plans(code),
  status          TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  starts_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  approved_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  last_request_id UUID REFERENCES public.membership_requests(id) ON DELETE SET NULL,
  revoked_reason  TEXT,
  reminded        JSONB NOT NULL DEFAULT '{}'::jsonb   -- R7, for the reminder job (phase 4)
);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "memberships: own or admin read" ON public.memberships;
CREATE POLICY "memberships: own or admin read" ON public.memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
REVOKE ALL ON public.memberships FROM anon, authenticated;
GRANT SELECT ON public.memberships TO authenticated;                  -- written only by the functions below

CREATE TABLE IF NOT EXISTS public.membership_audit (                  -- R9
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action          TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'revoke', 'refund')),
  user_id         UUID NOT NULL,
  request_id      UUID,
  done_by         UUID,
  done_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_expires_at TIMESTAMPTZ,
  new_expires_at  TIMESTAMPTZ,
  reason          TEXT,
  receipt_check   JSONB
);
ALTER TABLE public.membership_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membership_audit: admin read" ON public.membership_audit;
CREATE POLICY "membership_audit: admin read" ON public.membership_audit FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.membership_audit FROM anon, authenticated;
GRANT SELECT ON public.membership_audit TO authenticated;

-- ── Receipts bucket (R8, R10) ─────────────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-receipts', 'payment-receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];
DROP POLICY IF EXISTS "payment-receipts: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "payment-receipts: admin read" ON storage.objects;
-- A student uploads into their own folder, once (no update policy, so nothing can be replaced). No read for students:
-- admins see receipts through short-lived signed links (R10).
CREATE POLICY "payment-receipts: owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "payment-receipts: admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND public.is_admin());

-- ── Access ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.effective_tier(p_user UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.memberships m
                  WHERE m.user_id = p_user AND m.status = 'active' AND m.expires_at > now()) THEN 'premium'   -- R1
    ELSE (SELECT p.subscription_tier FROM public.profiles p WHERE p.id = p_user)
  END
$$;
REVOKE ALL ON FUNCTION public.effective_tier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_tier(UUID) TO authenticated;

-- Computed column for PostgREST: select("…, effective_plan") on profiles.
CREATE OR REPLACE FUNCTION public.effective_plan(p public.profiles)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.effective_tier(p.id) $$;
REVOKE ALL ON FUNCTION public.effective_plan(public.profiles) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_plan(public.profiles) TO authenticated;

-- 20261022120000, with the tier read through effective_tier().
CREATE OR REPLACE FUNCTION public.is_tier_limited(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tcfg('limits_live') = 1
     AND EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = p_user AND p.role = 'student' AND public.effective_tier(p.id) = 'free');
$$;

-- 20261009003423, with the tier read through effective_tier().
CREATE OR REPLACE FUNCTION public.start_case_attempt(p_case_id uuid)
RETURNS public.case_attempts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prof public.profiles;
  cs public.case_studies;
  att public.case_attempts;
  n int;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = auth.uid();
  IF prof.id IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF prof.role = 'student' AND public.effective_tier(prof.id) NOT IN ('standard','premium') THEN
    RAISE EXCEPTION 'case studies need a paid plan' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cs FROM public.case_studies WHERE id = p_case_id;
  IF cs.id IS NULL OR NOT cs.is_active THEN
    IF NOT (prof.role IN ('teacher','admin','super_admin') AND cs.id IS NOT NULL) THEN
      RAISE EXCEPTION 'case not available' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  SELECT * INTO att FROM public.case_attempts WHERE student_id = prof.id AND case_study_id = p_case_id AND completed_at IS NULL;
  IF att.id IS NOT NULL THEN RETURN att; END IF;
  SELECT count(*) INTO n FROM public.case_study_questions WHERE case_study_id = p_case_id;
  IF n = 0 THEN RAISE EXCEPTION 'case has no questions' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.case_attempts (student_id, case_study_id, total_questions, next_position)
  VALUES (prof.id, p_case_id, n, (SELECT min(display_order) FROM public.case_study_questions WHERE case_study_id = p_case_id))
  RETURNING * INTO att;
  RETURN att;
END;
$$;

-- ── Student: submit a request ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_membership_request(
  p_plan TEXT, p_paid_on DATE, p_method TEXT, p_reference TEXT, p_receipt_path TEXT)
RETURNS public.membership_requests
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  UUID := auth.uid();
  pl   public.membership_plans;
  req  public.membership_requests;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'student') THEN
    RAISE EXCEPTION 'plans are for student accounts' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = uid AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'confirm your email address first' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO pl FROM public.membership_plans WHERE code = p_plan AND active;
  IF pl.code IS NULL THEN RAISE EXCEPTION 'unknown plan' USING ERRCODE = '22023'; END IF;
  IF p_paid_on IS NULL OR p_paid_on > public.local_date(now()) OR p_paid_on < public.local_date(now()) - 60 THEN
    RAISE EXCEPTION 'the payment date must be within the last 60 days' USING ERRCODE = '22023';
  END IF;
  IF p_method NOT IN ('bank_transfer', 'online_banking', 'cash_deposit') THEN
    RAISE EXCEPTION 'unknown payment method' USING ERRCODE = '22023';
  END IF;
  IF p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'enter the payment reference' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_path IS NULL OR p_receipt_path !~ ('^' || uid::text || '/[A-Za-z0-9._-]+$')
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'payment-receipts' AND o.name = p_receipt_path) THEN
    RAISE EXCEPTION 'upload the receipt first' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.membership_requests WHERE user_id = uid AND status = 'pending') THEN   -- R12
    RAISE EXCEPTION 'you already have a payment waiting to be checked' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.membership_requests (user_id, plan_code, amount_ttd, paid_on, method, reference, receipt_path)
  VALUES (uid, pl.code, pl.price_ttd, p_paid_on, p_method, btrim(p_reference), p_receipt_path)
  RETURNING * INTO req;
  RETURN req;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_membership_request(TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_membership_request(TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- ── Admin: approve, reject, revoke, record a refund ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_membership(p_request UUID, p_checklist JSONB)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req   public.membership_requests;
  pl    public.membership_plans;
  cur   public.memberships;
  ticks JSONB;
  base  TIMESTAMPTZ;
  new_exp TIMESTAMPTZ;
  keep  BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO req FROM public.membership_requests WHERE id = p_request FOR UPDATE;      -- a double click waits here
  IF req.id IS NULL THEN RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'this request was already decided' USING ERRCODE = '55000'; END IF;

  ticks := jsonb_build_object(                                                             -- known keys only
    'payment_found',     COALESCE((p_checklist ->> 'payment_found')::boolean, false),
    'amount_matches',    COALESCE((p_checklist ->> 'amount_matches')::boolean, false),
    'plan_correct',      COALESCE((p_checklist ->> 'plan_correct')::boolean, false),
    'warnings_reviewed', COALESCE((p_checklist ->> 'warnings_reviewed')::boolean, false));
  IF NOT ((ticks ->> 'payment_found')::boolean AND (ticks ->> 'amount_matches')::boolean AND (ticks ->> 'plan_correct')::boolean) THEN
    RAISE EXCEPTION 'tick every item on the checklist first' USING ERRCODE = '22023';     -- R5
  END IF;
  IF req.receipt_check ->> 'result' = 'flagged' AND NOT (ticks ->> 'warnings_reviewed')::boolean THEN
    RAISE EXCEPTION 'this receipt has warnings: confirm you found the payment on the bank statement itself' USING ERRCODE = '22023';  -- R11
  END IF;

  SELECT * INTO pl FROM public.membership_plans WHERE code = req.plan_code;
  SELECT * INTO cur FROM public.memberships WHERE user_id = req.user_id FOR UPDATE;
  keep := cur.user_id IS NOT NULL AND cur.status = 'active' AND cur.expires_at > now();   -- R4
  base := CASE WHEN keep THEN cur.expires_at ELSE now() END;
  new_exp := base + make_interval(months => pl.months);                                       -- R3 (month ends clamp)

  INSERT INTO public.memberships (user_id, plan_code, status, starts_at, expires_at, approved_by, approved_at, last_request_id, revoked_reason, reminded)
  VALUES (req.user_id, pl.code, 'active', now(), new_exp, auth.uid(), now(), req.id, NULL, '{}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_code = EXCLUDED.plan_code, status = 'active',
    starts_at = CASE WHEN keep THEN public.memberships.starts_at ELSE now() END,
    expires_at = EXCLUDED.expires_at, approved_by = EXCLUDED.approved_by, approved_at = now(),
    last_request_id = EXCLUDED.last_request_id, revoked_reason = NULL, reminded = '{}'::jsonb;

  UPDATE public.membership_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), checklist = ticks
   WHERE id = req.id;
  INSERT INTO public.membership_audit (action, user_id, request_id, done_by, prev_expires_at, new_expires_at, receipt_check)
  VALUES ('approve', req.user_id, req.id, auth.uid(), CASE WHEN cur.user_id IS NOT NULL THEN cur.expires_at END, new_exp, req.receipt_check);
  RETURN jsonb_build_object('expires_at', new_exp, 'extended', keep);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_membership(p_request UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.membership_requests;
  why TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  IF length(why) = 0 OR length(why) > 1000 THEN
    RAISE EXCEPTION 'give the student a reason (up to 1000 characters)' USING ERRCODE = '22023';   -- R6
  END IF;
  SELECT * INTO req FROM public.membership_requests WHERE id = p_request FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'request not found' USING ERRCODE = 'P0002'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'this request was already decided' USING ERRCODE = '55000'; END IF;
  UPDATE public.membership_requests SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = why
   WHERE id = req.id;
  INSERT INTO public.membership_audit (action, user_id, request_id, done_by, reason, receipt_check)
  VALUES ('reject', req.user_id, req.id, auth.uid(), why, req.receipt_check);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_membership(p_user UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur public.memberships;
  why TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  IF length(why) = 0 OR length(why) > 1000 THEN RAISE EXCEPTION 'give a reason' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM public.memberships WHERE user_id = p_user FOR UPDATE;
  IF cur.user_id IS NULL OR cur.status <> 'active' THEN RAISE EXCEPTION 'no active plan to revoke' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.memberships SET status = 'revoked', revoked_reason = why WHERE user_id = p_user;
  INSERT INTO public.membership_audit (action, user_id, done_by, prev_expires_at, reason)
  VALUES ('revoke', p_user, auth.uid(), cur.expires_at, why);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_membership_refund(p_request UUID, p_on DATE, p_reference TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE req public.membership_requests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO req FROM public.membership_requests WHERE id = p_request FOR UPDATE;
  IF req.id IS NULL OR req.status <> 'rejected' THEN RAISE EXCEPTION 'only a rejected payment is refunded' USING ERRCODE = '22023'; END IF;
  IF p_on IS NULL OR length(btrim(COALESCE(p_reference, ''))) = 0 THEN RAISE EXCEPTION 'enter the refund date and reference' USING ERRCODE = '22023'; END IF;
  UPDATE public.membership_requests SET refund_on = p_on, refund_reference = btrim(p_reference) WHERE id = req.id;
  INSERT INTO public.membership_audit (action, user_id, request_id, done_by, reason)
  VALUES ('refund', req.user_id, req.id, auth.uid(), 'refunded ' || p_on || ', ref ' || btrim(p_reference));
END;
$$;

-- Admin overview: requests (pending, and decided in the last 90 days) and memberships, with names and emails.
CREATE OR REPLACE FUNCTION public.membership_admin_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admins only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'requests', COALESCE((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('name', p.full_name, 'email', u.email,
                    'plan_name', pl.name, 'plan_months', pl.months,
                    'current_expires_at', (SELECT m.expires_at FROM public.memberships m WHERE m.user_id = r.user_id AND m.status = 'active'))
                  ORDER BY r.submitted_at DESC)
       FROM public.membership_requests r
       JOIN public.profiles p ON p.id = r.user_id
       JOIN public.membership_plans pl ON pl.code = r.plan_code
       LEFT JOIN auth.users u ON u.id = r.user_id
      WHERE r.status = 'pending' OR r.reviewed_at > now() - interval '90 days'), '[]'::jsonb),
    'memberships', COALESCE((SELECT jsonb_agg(to_jsonb(m) || jsonb_build_object('name', p.full_name, 'email', u.email, 'plan_name', pl.name)
                  ORDER BY m.expires_at)
       FROM public.memberships m
       JOIN public.profiles p ON p.id = m.user_id
       JOIN public.membership_plans pl ON pl.code = m.plan_code
       LEFT JOIN auth.users u ON u.id = m.user_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_membership(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_membership(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_membership(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_membership_refund(UUID, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.membership_admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_membership(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_membership(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_membership(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_membership_refund(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.membership_admin_overview() TO authenticated;
