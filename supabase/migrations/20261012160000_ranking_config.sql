-- Ranking v2, phase 2a: every tunable number in one table, and the rank ladder in SQL.
--
-- Jade (or an admin) changes a rule by updating a row here; no code changes. `confirmed` records whether the value came
-- from Jade or Ian (true) or is a proposal still awaiting their sign-off (false). Read with rcfg('key').
-- rules_live = 0 is SHADOW MODE: the old awards are paid and the new rules are only computed and logged (xp_shadow).

CREATE TABLE IF NOT EXISTS public.ranking_config (
  key        TEXT PRIMARY KEY,
  value      NUMERIC NOT NULL,
  confirmed  BOOLEAN NOT NULL,
  note       TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ranking_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ranking_config: staff read" ON public.ranking_config;
CREATE POLICY "ranking_config: staff read" ON public.ranking_config FOR SELECT TO authenticated USING (public.is_teaching_staff());
DROP POLICY IF EXISTS "ranking_config: admin update" ON public.ranking_config;
CREATE POLICY "ranking_config: admin update" ON public.ranking_config FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.ranking_config FROM anon, authenticated;
GRANT SELECT, UPDATE (value, note, updated_at) ON public.ranking_config TO authenticated;

INSERT INTO public.ranking_config (key, value, confirmed, note) VALUES
  ('rules_live',               0,    true,  '0 = shadow mode (old awards paid, new rules logged to xp_shadow); 1 = new rules pay. Switched only at go-live.'),
  ('topic_window',             30,   true,  'Jade: topic state from the last 30 answers in the topic'),
  ('topic_min_answers',        10,   true,  'Jade: fewer than 10 answers = New'),
  ('weak_max_pct',             30,   true,  'Jade: accuracy 30% or less = Weak'),
  ('mastered_min_pct',         75,   true,  'Jade: accuracy 75% or more = Mastered'),
  ('mult_new',                 1.5,  true,  'Jade: XP multiplier for a New topic'),
  ('mult_weak',                1.5,  true,  'Jade: XP multiplier for a Weak topic'),
  ('mult_developing',          1.0,  true,  'Jade: XP multiplier for a Developing topic'),
  ('mult_mastered',            0.5,  true,  'Jade: XP multiplier for a Mastered topic'),
  ('repeat_days',              14,   true,  'Plan: a question answered in the last 14 days is a repeat'),
  ('repeat_factor',            0.25, true,  'Plan: repeats count at 0.25, stacked on the topic multiplier'),
  ('practice_daily_cap',       300,  true,  'Plan: practice XP capped at 300 a day (Trinidad time); streak bonus is outside the cap'),
  ('mastery_bonus',            200,  true,  'Jade: one-time 200 XP when a topic goes from Weak to Mastered'),
  ('streak_min_questions',     10,   true,  'Client: a streak day needs 10+ distinct questions'),
  ('streak_xp_per_day',        10,   true,  'Jade: 10 XP x streak length'),
  ('streak_xp_cap',            70,   true,  'Plan: streak bonus capped at 70 a day (day 7)'),
  ('mock_repeat_factor',       0.25, false, 'Ian: a retaken mock set pays less (confirmed). The 0.25 size mirrors the practice repeat rule and is unconfirmed.'),
  ('promo_questions',          25,   true,  'Jade: promotion quiz length'),
  ('promo_seconds',            90,   true,  'Jade: seconds per question'),
  ('promo_grace_seconds',      5,    false, 'Proposed: network grace on the 90-second server clock'),
  ('promo_pass_mark',          17,   true,  'Ian, 2026-10-12: pass with 17 of 25'),
  ('promo_retake_hours',       24,   false, 'Proposed: wait before retaking a failed quiz'),
  ('promo_exclude_recent_days',14,   false, 'Proposed: quiz excludes questions the student answered in the last 14 days')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rcfg(p_key TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v NUMERIC;
BEGIN
  SELECT value INTO v FROM public.ranking_config WHERE key = p_key;
  IF v IS NULL THEN RAISE EXCEPTION 'ranking_config has no %', p_key; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.rcfg(TEXT) FROM PUBLIC, anon, authenticated;

-- The rank ladder (Jade's 25 levels, src/lib/xp/ranks.ts), so the database can tell what level a student's XP allows.
CREATE TABLE IF NOT EXISTS public.rank_levels (
  level  INT PRIMARY KEY CHECK (level BETWEEN 0 AND 24),
  name   TEXT NOT NULL,
  min_xp INT NOT NULL UNIQUE
);
ALTER TABLE public.rank_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rank_levels: read" ON public.rank_levels;
CREATE POLICY "rank_levels: read" ON public.rank_levels FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.rank_levels FROM anon, authenticated;
GRANT SELECT ON public.rank_levels TO authenticated;

INSERT INTO public.rank_levels (level, name, min_xp) VALUES
  (0,'Novice I',0),(1,'Novice II',200),(2,'Novice III',500),(3,'Novice IV',900),(4,'Novice V',1400),
  (5,'Advanced Beginner I',2000),(6,'Advanced Beginner II',2700),(7,'Advanced Beginner III',3500),(8,'Advanced Beginner IV',4400),(9,'Advanced Beginner V',5400),
  (10,'Competent I',6500),(11,'Competent II',7700),(12,'Competent III',9000),(13,'Competent IV',10400),(14,'Competent V',11900),
  (15,'Proficient I',13500),(16,'Proficient II',15200),(17,'Proficient III',17000),(18,'Proficient IV',18900),(19,'Proficient V',20900),
  (20,'Expert I',23000),(21,'Expert II',25200),(22,'Expert III',27500),(23,'Expert IV',29900),(24,'Expert V',32500)
ON CONFLICT (level) DO NOTHING;
