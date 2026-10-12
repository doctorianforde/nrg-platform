-- Ranking v2, phase 2b: ledger reasons, a staff-only breakdown on awards, per-answer weights, and the shadow log.
--
-- Students see only rank, streak and XP total (Jade). The breakdown (topic state, repeats, multiplier) is kept for
-- staff and debugging in xp_events.detail and question_attempts.xp_weight, and both columns are withheld from the
-- `authenticated` role with column privileges, so a student cannot read them through the API either.

ALTER TABLE public.xp_events DROP CONSTRAINT IF EXISTS xp_events_reason_check;
ALTER TABLE public.xp_events ADD CONSTRAINT xp_events_reason_check
  CHECK (reason IN ('mock_exam', 'question_approved', 'practice_session', 'streak_day', 'topic_mastered'));
ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS detail JSONB;

REVOKE SELECT ON public.xp_events FROM authenticated;
GRANT SELECT (id, user_id, amount, reason, source_id, created_at) ON public.xp_events TO authenticated;

-- The weight each practice answer carried (topic multiplier x repeat factor) at the moment it was answered.
ALTER TABLE public.question_attempts ADD COLUMN IF NOT EXISTS xp_weight NUMERIC;
REVOKE SELECT ON public.question_attempts FROM authenticated;
GRANT SELECT (id, user_id, question_id, option_ids, domain_id, is_correct, source, session_id, answered_at)
  ON public.question_attempts TO authenticated;

-- An award with its breakdown. Same guarantees as award_xp: students only, one award per (reason, source).
CREATE OR REPLACE FUNCTION public.award_xp_detail(p_user UUID, p_amount INT, p_reason TEXT, p_source UUID, p_detail JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RETURN false; END IF;
  IF public.is_staff(p_user) THEN RETURN false; END IF;
  INSERT INTO public.xp_events (user_id, amount, reason, source_id, detail)
  VALUES (p_user, p_amount, p_reason, p_source, p_detail)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.award_xp_detail(UUID, INT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Shadow mode: what the new rules WOULD pay next to what the old rules paid, for comparison before go-live.
CREATE TABLE IF NOT EXISTS public.xp_shadow (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('practice', 'mock', 'streak_day', 'topic_mastered')),
  source_id  UUID NOT NULL,
  old_amount INT NOT NULL,
  new_amount INT NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, source_id)
);
CREATE INDEX IF NOT EXISTS idx_xp_shadow_user ON public.xp_shadow (user_id, created_at DESC);
ALTER TABLE public.xp_shadow ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xp_shadow: staff read" ON public.xp_shadow;
CREATE POLICY "xp_shadow: staff read" ON public.xp_shadow FOR SELECT TO authenticated USING (public.is_teaching_staff());
REVOKE ALL ON public.xp_shadow FROM anon, authenticated;
GRANT SELECT ON public.xp_shadow TO authenticated;

-- Staff view of a student's award breakdowns (the detail column is not readable directly).
CREATE OR REPLACE FUNCTION public.xp_event_details(p_user UUID)
RETURNS TABLE (id UUID, amount INT, reason TEXT, source_id UUID, detail JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_teaching_staff() THEN RAISE EXCEPTION 'staff only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT e.id, e.amount, e.reason, e.source_id, e.detail, e.created_at
                 FROM public.xp_events e WHERE e.user_id = p_user ORDER BY e.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.xp_event_details(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xp_event_details(UUID) TO authenticated;
