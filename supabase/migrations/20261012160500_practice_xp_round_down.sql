-- Ranking v2: the plan's worked example pays 12 XP for 25 mastered repeats (100 x 0.125 = 12.5), so session XP is
-- rounded DOWN, not half-up (Postgres round(12.5) = 13). Minimum 1 is unchanged.
CREATE OR REPLACE FUNCTION public.practice_xp_v2(p_answered INT, p_weights NUMERIC[])
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(1, floor(public.xp_for_practice(p_answered)
                           * (SELECT avg(w) FROM unnest(p_weights) w) + 0.000001))::int
$$;
REVOKE ALL ON FUNCTION public.practice_xp_v2(INT, NUMERIC[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.practice_xp_v2(INT, NUMERIC[]) TO service_role;
