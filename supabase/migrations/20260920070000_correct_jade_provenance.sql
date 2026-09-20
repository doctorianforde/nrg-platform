-- Correct the provenance of Jade's own questions, then make the mistake that
-- created this situation impossible to repeat.
--
-- FOUND 2026-09-20 while answering "are the 2,000 AI questions in prod the same as
-- the ones in staging?". They are — identical source_ids, and inert in both
-- (is_active=false, review_status='pending'). The 2,000 were never the problem.
--
-- The problem was next to them. Prod was serving 460 live questions against
-- staging's 100, and the 360-question difference was seven `jade:*` batches flagged
-- `is_ai_generated = true`, carrying no author tag, and marked `review_status =
-- 'approved'` with `reviewed_by = NULL`. Nobody had approved them; the flag was set
-- so the rows could satisfy questions_ai_active_requires_approval and go live.
--
-- Ian confirmed these are Jade's own writing, so the AI flag was simply wrong on
-- import. Correcting it is the honest fix and it keeps them live, which is what they
-- were meant to be:
--
--   * is_ai_generated -> false, matching jade:nrg-sample-1, the one batch that was
--     imported correctly.
--   * review_status -> 'approved', the convention 20260919010000 already applied to
--     every human-authored question ("Human-authored questions were never part of
--     the review queue").
--   * is_active is NOT touched. Prod's stay live, staging's stay inactive; staging is
--     deliberately a sandbox, not a mirror.
--
-- A side effect that is the point rather than a cost: they leave the AI review queue,
-- which filters on is_ai_generated. Jade should not be reviewing his own writing as
-- though a machine produced it.

-- ── 1. Correct the flag ──────────────────────────────────────────────────────
-- Scoped to the `jade:` source_id prefix, so this cannot touch the AI bank
-- (`ai:` prefix) or the imported prototype bank (`proto:` prefix).
UPDATE public.questions
   SET is_ai_generated = false,
       review_status   = 'approved'
 WHERE source_id LIKE 'jade:%'
   AND is_ai_generated;

-- ── 2. Attribute them ───────────────────────────────────────────────────────
-- The same tag jade:nrg-sample-1 already carries, so every question Jade wrote is
-- discoverable the same way regardless of which file it arrived in.
INSERT INTO public.tags (name) VALUES ('Author: Jade Nicome')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.question_tags (question_id, tag_id)
SELECT q.id, t.id
  FROM public.questions q
  CROSS JOIN public.tags t
 WHERE q.source_id LIKE 'jade:%'
   AND t.name = 'Author: Jade Nicome'
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- ── 3. Make "approved" mean a person approved it ────────────────────────────
-- questions_ai_active_requires_approval (20260919010000) already stops an
-- unapproved AI question going live. It does not stop `review_status` being set to
-- 'approved' by a bulk UPDATE with nobody's name against it, which is exactly how
-- 360 unreviewed questions ended up in front of students.
--
-- src/app/teacher/review/actions.ts always writes reviewed_by = the acting user, so
-- the real review path is unaffected. This only forecloses the shortcut.
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_approval_needs_a_reviewer;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_approval_needs_a_reviewer
  CHECK (NOT (is_ai_generated
              AND review_status = 'approved'
              AND reviewed_by IS NULL));

COMMENT ON CONSTRAINT questions_approval_needs_a_reviewer ON public.questions IS
  'An AI-generated question can only be approved by a named reviewer. Prevents a bulk UPDATE from marking machine-written content approved with nobody accountable for it.';
