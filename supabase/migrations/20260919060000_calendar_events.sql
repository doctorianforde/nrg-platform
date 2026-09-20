-- Event calendar, shown on every profile.
--
-- Two kinds of entry share one table, separated by `audience`:
--   'self'  — a student's own private entry. Only its author can read it, and
--             deliberately NOT staff: "students can make entries only on their
--             profile" reads as personal, so this is not a diary teachers browse.
--   others  — staff-created, targeted at everyone / all students / staff / a named
--             list of students.
--
-- Dates are DATE + optional TIME rather than timestamptz. An exam date or a class
-- slot is a wall-clock fact; storing it as an instant makes it shift for whoever
-- reads it from another timezone.

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  event_date  DATE NOT NULL,
  start_time  TIME,
  end_time    TIME,
  audience    TEXT NOT NULL DEFAULT 'self'
              CHECK (audience IN ('self','everyone','students','teachers','selected')),
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_time_order
    CHECK (start_time IS NULL OR end_time IS NULL OR end_time >= start_time),
  CONSTRAINT calendar_events_end_needs_start
    CHECK (end_time IS NULL OR start_time IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cal_date     ON public.calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_cal_author   ON public.calendar_events(created_by);
CREATE INDEX IF NOT EXISTS idx_cal_audience ON public.calendar_events(audience);

CREATE OR REPLACE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Named recipients, used only when audience = 'selected'.
CREATE TABLE IF NOT EXISTS public.calendar_event_audience (
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cea_user ON public.calendar_event_audience(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- SECURITY DEFINER so the calendar_events policy can consult the recipient list
-- without the two tables' policies referring to each other.
CREATE OR REPLACE FUNCTION public.is_calendar_target(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.calendar_event_audience a
     WHERE a.event_id = p_event_id AND a.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_teaching_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_role() IN ('teacher','admin','super_admin')
$$;

REVOKE ALL ON FUNCTION public.is_calendar_target(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_calendar_target(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_teaching_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teaching_staff() TO authenticated;

-- A 'self' entry belongs to its author; every other audience is staff-only to set.
CREATE OR REPLACE FUNCTION public.validate_calendar_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.audience <> 'self' AND NOT public.is_staff(NEW.created_by) THEN
    RAISE EXCEPTION 'only teaching staff may publish to an audience'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_validate_calendar_event
  BEFORE INSERT OR UPDATE OF audience, created_by ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_calendar_event();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_audience ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_events: read what is aimed at you"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      audience <> 'self'
      AND (
        audience = 'everyone'
        OR public.is_teaching_staff()
        OR (audience = 'students' AND public.user_role() = 'student')
        OR (audience = 'selected' AND public.is_calendar_target(id))
      )
    )
  );

-- Students may only ever create a private entry for themselves; staff may target.
CREATE POLICY "calendar_events: insert own, staff may target"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_teaching_staff() OR audience = 'self')
  );

-- Your own entries, plus any published entry if you are staff. A student's private
-- entry is never editable by anyone else.
CREATE POLICY "calendar_events: update own, staff any published"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING      (created_by = auth.uid() OR (audience <> 'self' AND public.is_teaching_staff()))
  WITH CHECK (created_by = auth.uid() OR (audience <> 'self' AND public.is_teaching_staff()));

CREATE POLICY "calendar_events: delete own, staff any published"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR (audience <> 'self' AND public.is_teaching_staff()));

-- Recipient rows: you can see that you were named; staff manage the lists.
CREATE POLICY "calendar_event_audience: read own or staff"
  ON public.calendar_event_audience FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());

CREATE POLICY "calendar_event_audience: staff write"
  ON public.calendar_event_audience FOR ALL TO authenticated
  USING (public.is_teaching_staff())
  WITH CHECK (public.is_teaching_staff());

REVOKE ALL ON public.calendar_events         FROM anon, authenticated;
REVOKE ALL ON public.calendar_event_audience FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_audience TO authenticated;
