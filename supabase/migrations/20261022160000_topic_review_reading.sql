-- Topic reviews: XP for reading, and the free tier's one review a day for five minutes (Ian, 2026-10-22; Jade's XP spec
-- and v2 templates 7.1/8.1).
--
-- Reading: open_topic_review() records when a student opens a review (one row per review per Trinidad day). Reaching the
-- end at least review_min_seconds after opening calls complete_topic_review(), which records the read once per review per
-- student and pays review_read_xp through the ranking v2 path: paid while rules_live = 1, logged to xp_shadow while 0.
--
-- Free tier (while tier_config.limits_live = 1): a free student opens free_reviews_per_day reviews a day, each readable for
-- free_review_minutes from when they opened it. Enforced in the topic_reviews SELECT policy, so the content itself is
-- unreadable outside that window, not just hidden by the page. The list stays visible through topic_review_list().
--
-- Rollback: restore the 20261022140000 SELECT policy; drop the four functions, topic_review_unlocked(), the two tables;
-- restore the two CHECK constraints without 'topic_review'; delete the four config rows.

INSERT INTO public.ranking_config (key, value, confirmed, note) VALUES
  ('review_read_xp',     30,  true,  'Jade XP spec: 30 XP for reading a topic review (Ian approved 2026-10-22). Once per review per student.'),
  ('review_min_seconds', 180, false, 'Proposed: a review counts as read when the student reaches the end at least 3 minutes after opening it')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.tier_config (key, value, confirmed, note) VALUES
  ('free_reviews_per_day', 1, true, 'Jade v2 template 7.1/8.1: free tier gets 1 topic review (Ian approved 2026-10-22); per Trinidad day'),
  ('free_review_minutes',  5, true, 'Jade v2 template 7.1/8.1: the free topic review is partial, on a 5-minute timer')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.xp_events DROP CONSTRAINT IF EXISTS xp_events_reason_check;
ALTER TABLE public.xp_events ADD CONSTRAINT xp_events_reason_check
  CHECK (reason IN ('mock_exam', 'question_approved', 'practice_session', 'streak_day', 'topic_mastered', 'topic_review'));
ALTER TABLE public.xp_shadow DROP CONSTRAINT IF EXISTS xp_shadow_kind_check;
ALTER TABLE public.xp_shadow ADD CONSTRAINT xp_shadow_kind_check
  CHECK (kind IN ('practice', 'mock', 'streak_day', 'topic_mastered', 'topic_review'));

CREATE TABLE IF NOT EXISTS public.topic_review_opens (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.topic_reviews(id) ON DELETE CASCADE,
  day       DATE NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, review_id, day)
);
CREATE INDEX IF NOT EXISTS idx_topic_review_opens_day ON public.topic_review_opens(user_id, day);
ALTER TABLE public.topic_review_opens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topic_review_opens: own read" ON public.topic_review_opens;
CREATE POLICY "topic_review_opens: own read" ON public.topic_review_opens FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.topic_review_opens FROM anon, authenticated;
GRANT SELECT ON public.topic_review_opens TO authenticated;

-- One row per review a student has read. Its id is the XP source, so the (reason, source_id) index pays it once.
CREATE TABLE IF NOT EXISTS public.topic_review_reads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id    UUID NOT NULL REFERENCES public.topic_reviews(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  xp           INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, review_id)
);
ALTER TABLE public.topic_review_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topic_review_reads: own read" ON public.topic_review_reads;
CREATE POLICY "topic_review_reads: own read" ON public.topic_review_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.topic_review_reads FROM anon, authenticated;
GRANT SELECT ON public.topic_review_reads TO authenticated;

-- May the caller read this review's content right now? Unlimited callers always; a limited free student only inside the
-- window of a review they opened today.
CREATE OR REPLACE FUNCTION public.topic_review_unlocked(p_review UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_tier_limited(auth.uid())
      OR EXISTS (SELECT 1 FROM public.topic_review_opens o
                  WHERE o.user_id = auth.uid() AND o.review_id = p_review AND o.day = public.local_date(now())
                    AND o.opened_at > now() - make_interval(mins => public.tcfg('free_review_minutes')::int));
$$;
REVOKE ALL ON FUNCTION public.topic_review_unlocked(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topic_review_unlocked(UUID) TO authenticated;

DROP POLICY IF EXISTS "topic_reviews: read published or staff" ON public.topic_reviews;
CREATE POLICY "topic_reviews: read published or staff" ON public.topic_reviews FOR SELECT TO authenticated
  USING (public.is_teaching_staff() OR (status = 'published' AND public.topic_review_unlocked(id)));

-- The list (no content), whatever the caller's plan, plus whether they opened each today and have read it.
CREATE OR REPLACE FUNCTION public.topic_review_list()
RETURNS TABLE (id UUID, slug TEXT, title TEXT, system TEXT, status TEXT, keywords TEXT[], exclude TEXT[], related TEXT[],
               sort_order INT, opened_today BOOLEAN, read BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.slug, r.title, r.system, r.status, r.keywords, r.exclude, r.related, r.sort_order,
         EXISTS (SELECT 1 FROM public.topic_review_opens o WHERE o.user_id = auth.uid() AND o.review_id = r.id AND o.day = public.local_date(now())),
         EXISTS (SELECT 1 FROM public.topic_review_reads x WHERE x.user_id = auth.uid() AND x.review_id = r.id)
    FROM public.topic_reviews r
   WHERE auth.uid() IS NOT NULL AND (r.status = 'published' OR public.is_teaching_staff())
   ORDER BY r.sort_order;
$$;

-- Where the caller stands with one review: exists, free-tier window, reading progress, and the XP on offer.
CREATE OR REPLACE FUNCTION public.topic_review_access(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  rid     UUID;
  today   DATE := public.local_date(now());
  opened  TIMESTAMPTZ;
  mins    INT := public.tcfg('free_review_minutes')::int;
  limited BOOLEAN;
  used    INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  SELECT r.id INTO rid FROM public.topic_reviews r WHERE r.slug = p_slug AND (r.status = 'published' OR public.is_teaching_staff());
  IF rid IS NULL THEN RETURN jsonb_build_object('exists', false); END IF;
  limited := public.is_tier_limited(uid);
  SELECT o.opened_at INTO opened FROM public.topic_review_opens o WHERE o.user_id = uid AND o.review_id = rid AND o.day = today;
  SELECT count(*) INTO used FROM public.topic_review_opens o WHERE o.user_id = uid AND o.day = today AND o.review_id <> rid;
  RETURN jsonb_build_object(
    'exists', true,
    'limited', limited,
    'per_day', public.tcfg('free_reviews_per_day')::int,
    'minutes', mins,
    'used_today', used + CASE WHEN opened IS NULL THEN 0 ELSE 1 END,
    'quota_left', limited AND opened IS NULL AND used < public.tcfg('free_reviews_per_day')::int,
    'opened_at', opened,
    'expires_at', CASE WHEN limited AND opened IS NOT NULL THEN opened + make_interval(mins => mins) END,
    'read', EXISTS (SELECT 1 FROM public.topic_review_reads x WHERE x.user_id = uid AND x.review_id = rid),
    'xp', public.rcfg('review_read_xp')::int,
    'xp_live', public.rcfg('rules_live') = 1,
    'min_seconds', public.rcfg('review_min_seconds')::int,
    'is_student', NOT public.is_staff(uid));
END;
$$;

-- A student opens a review. Free students spend their daily allowance here (re-opening the same review that day is
-- free, but its window doesn't restart). Staff are never recorded.
CREATE OR REPLACE FUNCTION public.open_topic_review(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    UUID := auth.uid();
  rid    UUID;
  today  DATE := public.local_date(now());
  opened TIMESTAMPTZ;
  used   INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  SELECT r.id INTO rid FROM public.topic_reviews r WHERE r.slug = p_slug AND r.status = 'published';
  IF rid IS NULL THEN RETURN jsonb_build_object('allowed', public.is_teaching_staff(), 'reason', 'not_published'); END IF;
  IF public.is_staff(uid) THEN RETURN jsonb_build_object('allowed', true); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('topic_review_open:' || uid::text));
  SELECT o.opened_at INTO opened FROM public.topic_review_opens o WHERE o.user_id = uid AND o.review_id = rid AND o.day = today;
  IF opened IS NULL THEN
    IF public.is_tier_limited(uid) THEN
      SELECT count(*) INTO used FROM public.topic_review_opens o WHERE o.user_id = uid AND o.day = today;
      IF used >= public.tcfg('free_reviews_per_day')::int THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'quota');
      END IF;
    END IF;
    INSERT INTO public.topic_review_opens (user_id, review_id, day) VALUES (uid, rid, today) RETURNING opened_at INTO opened;
  END IF;
  IF public.is_tier_limited(uid) AND opened <= now() - make_interval(mins => public.tcfg('free_review_minutes')::int) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'time', 'opened_at', opened);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'opened_at', opened);
END;
$$;

-- A student reached the end. Records the read once and pays the XP (or logs it in shadow mode).
CREATE OR REPLACE FUNCTION public.complete_topic_review(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid    UUID := auth.uid();
  rid    UUID;
  opened TIMESTAMPTZ;
  need   INT := public.rcfg('review_min_seconds')::int;
  amt    INT := public.rcfg('review_read_xp')::int;
  live   BOOLEAN := public.rcfg('rules_live') = 1;
  rd     public.topic_review_reads;
  detail JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF public.is_staff(uid) THEN RETURN jsonb_build_object('status', 'staff'); END IF;
  SELECT r.id INTO rid FROM public.topic_reviews r WHERE r.slug = p_slug AND r.status = 'published';
  IF rid IS NULL THEN RETURN jsonb_build_object('status', 'not_published'); END IF;
  IF EXISTS (SELECT 1 FROM public.topic_review_reads x WHERE x.user_id = uid AND x.review_id = rid) THEN
    RETURN jsonb_build_object('status', 'already');
  END IF;
  SELECT o.opened_at INTO opened FROM public.topic_review_opens o
   WHERE o.user_id = uid AND o.review_id = rid AND o.day = public.local_date(now());
  IF opened IS NULL THEN RETURN jsonb_build_object('status', 'not_open'); END IF;
  IF now() - opened < make_interval(secs => need) THEN
    RETURN jsonb_build_object('status', 'early', 'seconds_left', ceil(extract(epoch FROM (opened + make_interval(secs => need) - now())))::int);
  END IF;

  INSERT INTO public.topic_review_reads (user_id, review_id, xp) VALUES (uid, rid, CASE WHEN live THEN amt ELSE 0 END)
  ON CONFLICT (user_id, review_id) DO NOTHING
  RETURNING * INTO rd;
  IF rd.id IS NULL THEN RETURN jsonb_build_object('status', 'already'); END IF;
  detail := jsonb_build_object('review', p_slug, 'opened_at', opened, 'seconds', round(extract(epoch FROM (now() - opened))));
  IF live THEN
    PERFORM public.award_xp_detail(uid, amt, 'topic_review', rd.id, detail);
  ELSE
    INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
    VALUES (uid, 'topic_review', rd.id, 0, amt, detail)
    ON CONFLICT (kind, source_id) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('status', 'read', 'xp', CASE WHEN live THEN amt ELSE 0 END);
END;
$$;

REVOKE ALL ON FUNCTION public.topic_review_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.topic_review_access(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_topic_review(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_topic_review(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topic_review_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.topic_review_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_topic_review(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_topic_review(TEXT) TO authenticated;
