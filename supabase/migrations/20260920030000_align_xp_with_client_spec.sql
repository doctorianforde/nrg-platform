-- Re-base the XP awards on the client's own rank design.
--
-- 20260920010000 used weights I chose before seeing Jade's prototype. His spec
-- (OKComputer_NRG_Website/app/src/data/rankSystemData.ts, XP_AWARDS) sets a larger
-- scale to suit a 25-level ladder running to 32,500 XP, so the earlier weights
-- would have made the ladder unclimbable. These are his numbers where they map onto
-- something the platform actually records:
--
--   mockExam100         250   completing a mock paper
--   mockPass66          150   bonus for reaching the 66% RENR pass mark
--   complete25Questions 100   a practice run of 25+
--   complete10Questions  40   a practice run of 10+
--   qgen75to89          150   an approved question submission (unchanged)
--
-- Safe to re-base: the ledger is empty in both environments, so no totals move.
-- Deviation worth recording: his mock award assumes a 100-question paper. Ours can
-- be any length, so the 250 is paid for completing whatever the set holds, and the
-- 150 bonus is judged on the percentage rather than the count.

CREATE OR REPLACE FUNCTION public.xp_for_mock_exam(p_score NUMERIC)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT 250 + CASE WHEN COALESCE(p_score, 0) >= 66 THEN 150 ELSE 0 END
$$;

-- Banded rather than per-question, so a 30-question run pays the same as a
-- 25-question one and there is nothing to farm by padding a session.
CREATE OR REPLACE FUNCTION public.xp_for_practice(p_answered INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN COALESCE(p_answered, 0) >= 25 THEN 100
           WHEN COALESCE(p_answered, 0) >= 10 THEN 40
           ELSE 10
         END
$$;
