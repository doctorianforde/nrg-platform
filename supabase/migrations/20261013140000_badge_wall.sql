-- Trophies phase 3: the classmates' "Recent achievements" wall.
--
-- Students can't read each other's profiles (RLS), so the wall needs a definer function. It returns only what the wall
-- shows: a short display name (first name + last initial), the badge and when it was earned, and only for students who
-- leave "Show my badges to classmates" on. Staff never appear (they never earn badges anyway).

CREATE OR REPLACE FUNCTION public.short_name(p_full TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_full IS NULL OR btrim(p_full) = '' THEN 'A classmate'
           WHEN array_length(regexp_split_to_array(btrim(p_full), '\s+'), 1) = 1 THEN btrim(p_full)
           ELSE split_part(btrim(p_full), ' ', 1) || ' ' ||
                left((regexp_split_to_array(btrim(p_full), '\s+'))[array_length(regexp_split_to_array(btrim(p_full), '\s+'), 1)], 1) || '.'
         END
$$;

CREATE OR REPLACE FUNCTION public.recent_badge_wall(p_days INT DEFAULT 7, p_limit INT DEFAULT 30)
RETURNS TABLE (user_id UUID, display_name TEXT, badge_code TEXT, earned_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ub.user_id, public.short_name(p.full_name), ub.badge_code, ub.earned_at
    FROM public.user_badges ub
    JOIN public.profiles p ON p.id = ub.user_id
   WHERE auth.uid() IS NOT NULL
     AND p.role = 'student' AND p.show_badges
     AND ub.earned_at > now() - make_interval(days => LEAST(GREATEST(p_days, 1), 30))
   ORDER BY ub.earned_at DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 100)
$$;
REVOKE ALL ON FUNCTION public.recent_badge_wall(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recent_badge_wall(INT, INT) TO authenticated;

-- A classmate's short name for their trophy card, only when they show their badges (else NULL).
CREATE OR REPLACE FUNCTION public.classmate_short_name(p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.short_name(full_name) FROM public.profiles
   WHERE id = p_user AND auth.uid() IS NOT NULL AND (public.badges_visible(p_user) OR public.is_teaching_staff() OR id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.classmate_short_name(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classmate_short_name(UUID) TO authenticated;
