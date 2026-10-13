-- Trophies phase 1: the badge catalogue, earned badges, and the award engine (docs/phase-1/TROPHY_PLAN.md).
--
-- A badge is earned once, at the moment it happens, from data the platform already records. Thresholds live in
-- badge_definitions.criteria so Jade can change them (e.g. Century = 100 questions) without code. Staff never earn
-- badges. Badges give no XP (Ian, 2026-10-13). Students' badges are visible to classmates unless the student turns off
-- profiles.show_badges (Ian, 2026-10-13: visible to classmates, opt-out).
--
-- Hooks: answer-based badges (volume, streak, mastery) from apply_answer_bonuses, which runs once per practice session,
-- mock exam and promotion quiz; the rest from triggers when a mock exam, promotion quiz or case finishes and when a
-- student-written question is approved.

-- ── Catalogue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badge_definitions (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('rank', 'trophy', 'streak', 'mastery', 'volume', 'mock', 'promotion', 'case', 'contribution')),
  weight      TEXT NOT NULL CHECK (weight IN ('toast', 'major', 'ceremony')),   -- which celebration plays
  tier        TEXT,                                                                -- rank tier for rank badges
  criteria    JSONB NOT NULL,                                                      -- {"type": ..., parameters}
  art         TEXT NOT NULL,                                                       -- public/badges/<art>-512.png
  sort_order  INT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_secret   BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badge_definitions: read" ON public.badge_definitions;
CREATE POLICY "badge_definitions: read" ON public.badge_definitions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "badge_definitions: admin write" ON public.badge_definitions;
CREATE POLICY "badge_definitions: admin write" ON public.badge_definitions FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.badge_definitions FROM anon, authenticated;
GRANT SELECT ON public.badge_definitions TO authenticated;
GRANT UPDATE (name, description, criteria, is_active, is_secret, sort_order) ON public.badge_definitions TO authenticated;

-- 24 rank badges (one per promotion after Novice I), named from the ladder.
INSERT INTO public.badge_definitions (code, name, description, category, weight, tier, criteria, art, sort_order)
SELECT 'rank-' || level, name, 'Promoted to ' || name || ' by passing the promotion quiz.', 'rank', 'ceremony',
       t.tier, jsonb_build_object('type', 'rank', 'level', level), 'rank-' || t.tier, level
  FROM public.rank_levels
  CROSS JOIN LATERAL (SELECT CASE WHEN level < 5 THEN 'novice' WHEN level < 10 THEN 'advanced-beginner'
                                  WHEN level < 15 THEN 'competent' WHEN level < 20 THEN 'proficient' ELSE 'expert' END AS tier) t
 WHERE level >= 1
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.badge_definitions (code, name, description, category, weight, tier, criteria, art, sort_order) VALUES
  ('trophy-advanced-beginner', 'Advanced Beginner', 'Reached the Advanced Beginner tier.', 'trophy', 'ceremony', 'advanced-beginner', '{"type":"rank","level":5}', 'trophy-advanced-beginner', 105),
  ('trophy-competent', 'Competent Candidate', 'Reached the Competent Candidate tier.', 'trophy', 'ceremony', 'competent', '{"type":"rank","level":10}', 'trophy-competent', 110),
  ('trophy-proficient', 'Proficient Candidate', 'Reached the Proficient Candidate tier.', 'trophy', 'ceremony', 'proficient', '{"type":"rank","level":15}', 'trophy-proficient', 115),
  ('trophy-expert', 'Expert Candidate', 'Reached the Expert Candidate tier.', 'trophy', 'ceremony', 'expert', '{"type":"rank","level":20}', 'trophy-expert', 120),
  ('trophy-summit', 'Ready for Registration', 'Reached Expert V, the top of the ladder.', 'trophy', 'ceremony', 'expert', '{"type":"rank","level":24}', 'trophy-summit', 124),
  ('streak-7', 'On a Roll', '7 days in a row with 10 or more questions.', 'streak', 'toast', NULL, '{"type":"streak","days":7}', 'streak-7', 200),
  ('streak-30', 'Committed', '30 days in a row with 10 or more questions.', 'streak', 'major', NULL, '{"type":"streak","days":30}', 'streak-30', 201),
  ('streak-100', 'Unstoppable', '100 days in a row with 10 or more questions.', 'streak', 'major', NULL, '{"type":"streak","days":100}', 'streak-100', 202),
  ('turned-it-around', 'Turned It Around', 'Took a weak area all the way to mastered.', 'mastery', 'major', NULL, '{"type":"weak_to_mastered"}', 'turned-it-around', 300),
  ('domain-np', 'Nursing Practice Mastered', 'Mastered Nursing Practice.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"NP"}', 'domain-np', 301),
  ('domain-cdm', 'Clinical Decision Making Mastered', 'Mastered Clinical Decision Making and Intervention.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"CDM"}', 'domain-cdm', 302),
  ('domain-nlm', 'Leadership and Management Mastered', 'Mastered Nursing Leadership and Management.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"NLM"}', 'domain-nlm', 303),
  ('domain-pc', 'Professional Conduct Mastered', 'Mastered Professional Conduct.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"PC"}', 'domain-pc', 304),
  ('domain-hpmw', 'Health Promotion Mastered', 'Mastered Health Promotion and Maintenance of Wellness.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"HPMW"}', 'domain-hpmw', 305),
  ('domain-com', 'Communication Mastered', 'Mastered Communication.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"COM"}', 'domain-com', 306),
  ('domain-pd', 'Professional Development Mastered', 'Mastered Professional Development.', 'mastery', 'toast', NULL, '{"type":"domain_mastered","domain":"PD"}', 'domain-pd', 307),
  ('blueprint-master', 'Blueprint Master', 'All seven RENR domains mastered at the same time.', 'mastery', 'major', NULL, '{"type":"all_domains_mastered"}', 'blueprint-master', 308),
  ('first-steps', 'First Steps', 'Answered your first question.', 'volume', 'toast', NULL, '{"type":"volume","count":1}', 'first-steps', 400),
  ('century', 'Century', '100 questions answered.', 'volume', 'toast', NULL, '{"type":"volume","count":100}', 'century', 401),
  ('thousand-strong', 'Thousand Strong', '1,000 questions answered.', 'volume', 'major', NULL, '{"type":"volume","count":1000}', 'thousand-strong', 402),
  ('five-thousand', 'Five Thousand', '5,000 questions answered.', 'volume', 'major', NULL, '{"type":"volume","count":5000}', 'five-thousand', 403),
  ('first-paper', 'First Paper', 'Completed your first mock exam.', 'mock', 'toast', NULL, '{"type":"mock_completed","count":1}', 'first-paper', 500),
  ('pass-mark', 'Pass Mark', 'Scored 66% or more on a mock exam.', 'mock', 'major', NULL, '{"type":"mock_score","min_pct":66}', 'pass-mark', 501),
  ('distinction', 'Distinction', 'Scored 80% or more on a mock exam.', 'mock', 'major', NULL, '{"type":"mock_score","min_pct":80}', 'distinction', 502),
  ('team-player', 'Team Player', 'Completed a group mock exam.', 'mock', 'toast', NULL, '{"type":"group_mock"}', 'team-player', 503),
  ('flawless', 'Flawless', 'Every question right on a promotion quiz.', 'promotion', 'major', NULL, '{"type":"promotion_perfect"}', 'flawless', 600),
  ('first-time', 'First Time', 'Passed a promotion quiz on the first try.', 'promotion', 'toast', NULL, '{"type":"promotion_first_try"}', 'first-time', 601),
  ('case-opened', 'Case Opened', 'Completed your first case study.', 'case', 'toast', NULL, '{"type":"case_completed","count":1}', 'case-opened', 700),
  ('clinical-judgement', 'Clinical Judgement', 'All six clinical-judgement questions right in one case.', 'case', 'major', NULL, '{"type":"case_cj_perfect"}', 'clinical-judgement', 701),
  ('caseload', 'Caseload', '10 different case studies completed.', 'case', 'major', NULL, '{"type":"case_completed","count":10}', 'caseload', 702),
  ('author', 'Author', 'Your first question was approved for the bank.', 'contribution', 'major', NULL, '{"type":"questions_approved","count":1}', 'author', 800),
  ('prolific-author', 'Prolific Author', '10 of your questions approved for the bank.', 'contribution', 'major', NULL, '{"type":"questions_approved","count":10}', 'prolific-author', 801)
ON CONFLICT (code) DO NOTHING;

-- ── Earned badges ───────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_badges BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES public.badge_definitions(code),
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  context    JSONB,
  seen_at    TIMESTAMPTZ,              -- NULL until its celebration has played
  PRIMARY KEY (user_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_recent ON public.user_badges (earned_at DESC);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Whether a student shows their badges to classmates (definer, because students can't read other students' profiles).
CREATE OR REPLACE FUNCTION public.badges_visible(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT show_badges AND role = 'student' FROM public.profiles WHERE id = p_user), false) $$;
REVOKE ALL ON FUNCTION public.badges_visible(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.badges_visible(UUID) TO authenticated;

DROP POLICY IF EXISTS "user_badges: own, staff, or shown to classmates" ON public.user_badges;
CREATE POLICY "user_badges: own, staff, or shown to classmates" ON public.user_badges FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff() OR public.badges_visible(user_id));
REVOKE ALL ON public.user_badges FROM anon, authenticated;
GRANT SELECT ON public.user_badges TO authenticated;   -- no direct writes: badges come only from award_badges()

-- Mark the caller's own badges as celebrated.
CREATE OR REPLACE FUNCTION public.mark_badges_seen(p_codes TEXT[])
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  UPDATE public.user_badges SET seen_at = now()
   WHERE user_id = auth.uid() AND badge_code = ANY (p_codes) AND seen_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_badges_seen(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_badges_seen(TEXT[]) TO authenticated;

-- ── Award engine ────────────────────────────────────────────────────────────
-- Checks only the badges the event can affect and returns the codes newly earned. Idempotent: (user, badge) is unique.
CREATE OR REPLACE FUNCTION public.award_badges(p_user UUID, p_event TEXT, p_context JSONB DEFAULT '{}'::jsonb)
RETURNS TEXT[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  earned TEXT[] := '{}';
  d      RECORD;
  ok     BOOLEAN;
  n      INT;
  sess   public.mock_exam_sessions;
  pa     public.promotion_attempts;
  ca     public.case_attempts;
  dom    INT;
  st     TEXT;
BEGIN
  IF p_user IS NULL OR public.is_staff(p_user) THEN RETURN earned; END IF;
  IF p_event = 'mock' THEN SELECT * INTO sess FROM public.mock_exam_sessions WHERE id = (p_context->>'session')::uuid; END IF;
  IF p_event = 'promotion' THEN SELECT * INTO pa FROM public.promotion_attempts WHERE id = (p_context->>'attempt')::uuid; END IF;
  IF p_event = 'case' THEN SELECT * INTO ca FROM public.case_attempts WHERE id = (p_context->>'attempt')::uuid; END IF;

  FOR d IN SELECT * FROM public.badge_definitions b
            WHERE b.is_active
              AND NOT EXISTS (SELECT 1 FROM public.user_badges u WHERE u.user_id = p_user AND u.badge_code = b.code)
              AND b.criteria->>'type' = ANY (CASE p_event
                    WHEN 'answers' THEN ARRAY['volume', 'streak', 'domain_mastered', 'weak_to_mastered', 'all_domains_mastered']
                    WHEN 'mock' THEN ARRAY['mock_completed', 'mock_score', 'group_mock']
                    WHEN 'promotion' THEN ARRAY['rank', 'promotion_perfect', 'promotion_first_try']
                    WHEN 'case' THEN ARRAY['case_completed', 'case_cj_perfect']
                    WHEN 'question_approved' THEN ARRAY['questions_approved']
                    ELSE ARRAY[]::TEXT[] END)
  LOOP
    ok := false;
    CASE d.criteria->>'type'
      WHEN 'volume' THEN
        SELECT count(*) INTO n FROM public.question_attempts WHERE user_id = p_user;
        ok := n >= (d.criteria->>'count')::int;
      WHEN 'streak' THEN
        ok := public.streak_length_on(p_user, public.local_date(now())) >= (d.criteria->>'days')::int;
      WHEN 'domain_mastered' THEN
        SELECT id INTO dom FROM public.domains WHERE code = d.criteria->>'domain';
        IF dom IS NOT NULL AND COALESCE(p_context->'domains', '[]'::jsonb) @> to_jsonb(dom) THEN
          SELECT state INTO st FROM public.topic_state(p_user, dom);
          ok := st = 'mastered';
        END IF;
      WHEN 'weak_to_mastered' THEN
        ok := EXISTS (SELECT 1 FROM public.topic_weak_marks w
                       WHERE w.user_id = p_user
                         AND COALESCE(p_context->'domains', '[]'::jsonb) @> to_jsonb(w.domain_id)
                         AND (SELECT state FROM public.topic_state(p_user, w.domain_id)) = 'mastered');
      WHEN 'all_domains_mastered' THEN
        ok := NOT EXISTS (SELECT 1 FROM public.domains x
                           WHERE (SELECT state FROM public.topic_state(p_user, x.id)) <> 'mastered');
      WHEN 'mock_completed' THEN
        SELECT count(*) INTO n FROM public.mock_exam_sessions WHERE student_id = p_user AND completed_at IS NOT NULL;
        ok := n >= (d.criteria->>'count')::int;
      WHEN 'mock_score' THEN
        ok := sess.id IS NOT NULL AND sess.completed_at IS NOT NULL AND COALESCE(sess.score_pct, 0) >= (d.criteria->>'min_pct')::numeric;
      WHEN 'group_mock' THEN
        ok := sess.id IS NOT NULL AND sess.completed_at IS NOT NULL AND sess.group_id IS NOT NULL;
      WHEN 'rank' THEN
        ok := pa.id IS NOT NULL AND pa.passed AND pa.target_level = (d.criteria->>'level')::int;
      WHEN 'promotion_perfect' THEN
        ok := pa.id IS NOT NULL AND pa.passed AND pa.score = pa.question_count;
      WHEN 'promotion_first_try' THEN
        ok := pa.id IS NOT NULL AND pa.passed
              AND NOT EXISTS (SELECT 1 FROM public.promotion_attempts o
                               WHERE o.user_id = p_user AND o.target_level = pa.target_level AND o.passed IS FALSE);
      WHEN 'case_completed' THEN
        SELECT count(DISTINCT case_study_id) INTO n FROM public.case_attempts WHERE student_id = p_user AND completed_at IS NOT NULL;
        ok := n >= (d.criteria->>'count')::int;
      WHEN 'case_cj_perfect' THEN
        ok := ca.id IS NOT NULL AND ca.completed_at IS NOT NULL
              AND (SELECT count(DISTINCT l.cj_step) FROM public.case_attempt_responses r
                     JOIN public.case_study_questions l ON l.question_id = r.question_id AND l.case_study_id = ca.case_study_id
                    WHERE r.attempt_id = ca.id AND r.is_correct
                      AND l.cj_step IN ('recognize_cues', 'analyze_cues', 'prioritize_hypotheses', 'generate_solutions', 'take_action', 'evaluate_outcomes')) = 6;
      WHEN 'questions_approved' THEN
        SELECT count(*) INTO n FROM public.questions
         WHERE created_by = p_user AND review_status = 'approved' AND NOT is_ai_generated;
        ok := n >= (d.criteria->>'count')::int;
      ELSE ok := false;
    END CASE;

    IF ok THEN
      INSERT INTO public.user_badges (user_id, badge_code, context)
      VALUES (p_user, d.code, p_context || jsonb_build_object('event', p_event))
      ON CONFLICT DO NOTHING;
      IF FOUND THEN earned := earned || d.code; END IF;
    END IF;
  END LOOP;
  RETURN earned;
END;
$$;
REVOKE ALL ON FUNCTION public.award_badges(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_badges(UUID, TEXT, JSONB) TO service_role;

-- ── Hooks ───────────────────────────────────────────────────────────────────
-- Answer-based badges: apply_answer_bonuses already runs once per practice session, mock exam and promotion quiz.
CREATE OR REPLACE FUNCTION public.apply_answer_bonuses(p_user uuid, p_domains integer[], p_live boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  today  DATE := public.local_date(now());
  len    INT;
  amt    INT;
  src    UUID;
  d      INT;
  st     TEXT;
  out    JSONB := '{}'::jsonb;
BEGIN
  IF public.is_staff(p_user) THEN RETURN out; END IF;

  len := public.streak_length_on(p_user, today);
  IF len > 0 THEN
    amt := public.streak_bonus(len);
    src := md5(p_user::text || ':streak:' || today::text)::uuid;
    IF p_live THEN
      PERFORM public.award_xp_detail(p_user, amt, 'streak_day', src, jsonb_build_object('day', today, 'streak', len));
    ELSE
      INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
      VALUES (p_user, 'streak_day', src, 0, amt, jsonb_build_object('day', today, 'streak', len))
      ON CONFLICT (kind, source_id) DO NOTHING;
    END IF;
    out := out || jsonb_build_object('streak', len, 'streak_bonus', amt);
  END IF;

  FOREACH d IN ARRAY COALESCE(p_domains, '{}') LOOP
    SELECT state INTO st FROM public.topic_state(p_user, d);
    IF st = 'weak' THEN
      INSERT INTO public.topic_weak_marks (user_id, domain_id) VALUES (p_user, d) ON CONFLICT DO NOTHING;
    ELSIF st = 'mastered' AND EXISTS (SELECT 1 FROM public.topic_weak_marks WHERE user_id = p_user AND domain_id = d) THEN
      src := md5(p_user::text || ':mastered:' || d::text)::uuid;
      IF p_live THEN
        PERFORM public.award_xp_detail(p_user, public.rcfg('mastery_bonus')::int, 'topic_mastered', src, jsonb_build_object('domain_id', d));
      ELSE
        INSERT INTO public.xp_shadow (user_id, kind, source_id, old_amount, new_amount, detail)
        VALUES (p_user, 'topic_mastered', src, 0, public.rcfg('mastery_bonus')::int, jsonb_build_object('domain_id', d))
        ON CONFLICT (kind, source_id) DO NOTHING;
      END IF;
      out := out || jsonb_build_object('mastered_domain_' || d, true);
    END IF;
  END LOOP;

  -- Trophies phase 1: answer-based badges (independent of rules_live; badges carry no XP).
  PERFORM public.award_badges(p_user, 'answers', jsonb_build_object('domains', to_jsonb(COALESCE(p_domains, '{}'))));
  RETURN out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.badges_on_mock_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    PERFORM public.award_badges(NEW.student_id, 'mock', jsonb_build_object('session', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_badges_mock ON public.mock_exam_sessions;
CREATE TRIGGER trg_badges_mock AFTER UPDATE OF completed_at ON public.mock_exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.badges_on_mock_complete();

CREATE OR REPLACE FUNCTION public.badges_on_promotion_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.finished_at IS NOT NULL AND OLD.finished_at IS NULL THEN
    PERFORM public.award_badges(NEW.user_id, 'promotion', jsonb_build_object('attempt', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_badges_promotion ON public.promotion_attempts;
CREATE TRIGGER trg_badges_promotion AFTER UPDATE OF finished_at ON public.promotion_attempts
  FOR EACH ROW EXECUTE FUNCTION public.badges_on_promotion_finish();

CREATE OR REPLACE FUNCTION public.badges_on_case_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    PERFORM public.award_badges(NEW.student_id, 'case', jsonb_build_object('attempt', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_badges_case ON public.case_attempts;
CREATE TRIGGER trg_badges_case AFTER UPDATE OF completed_at ON public.case_attempts
  FOR EACH ROW EXECUTE FUNCTION public.badges_on_case_complete();

CREATE OR REPLACE FUNCTION public.badges_on_question_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.review_status = 'approved' AND COALESCE(OLD.review_status, '') <> 'approved'
     AND NEW.created_by IS NOT NULL AND NOT NEW.is_ai_generated THEN
    PERFORM public.award_badges(NEW.created_by, 'question_approved', jsonb_build_object('question', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_badges_question ON public.questions;
CREATE TRIGGER trg_badges_question AFTER UPDATE OF review_status ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.badges_on_question_approved();

REVOKE ALL ON FUNCTION public.badges_on_mock_complete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.badges_on_promotion_finish() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.badges_on_case_complete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.badges_on_question_approved() FROM PUBLIC, anon, authenticated;

-- ── Backfill (run once at launch; Ian: yes for mocks, cases and approved questions, not for volume or streaks) ──
CREATE OR REPLACE FUNCTION public.backfill_badges(p_user UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; total INT := 0; got TEXT[];
BEGIN
  FOR r IN SELECT id, student_id FROM public.mock_exam_sessions
            WHERE completed_at IS NOT NULL AND (p_user IS NULL OR student_id = p_user) ORDER BY completed_at LOOP
    got := public.award_badges(r.student_id, 'mock', jsonb_build_object('session', r.id, 'backfill', true));
    total := total + cardinality(got);
  END LOOP;
  FOR r IN SELECT id, student_id FROM public.case_attempts
            WHERE completed_at IS NOT NULL AND (p_user IS NULL OR student_id = p_user) ORDER BY completed_at LOOP
    got := public.award_badges(r.student_id, 'case', jsonb_build_object('attempt', r.id, 'backfill', true));
    total := total + cardinality(got);
  END LOOP;
  FOR r IN SELECT DISTINCT created_by AS uid FROM public.questions
            WHERE review_status = 'approved' AND NOT is_ai_generated AND created_by IS NOT NULL
              AND (p_user IS NULL OR created_by = p_user) LOOP
    got := public.award_badges(r.uid, 'question_approved', jsonb_build_object('backfill', true));
    total := total + cardinality(got);
  END LOOP;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.backfill_badges(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_badges(UUID) TO service_role;
