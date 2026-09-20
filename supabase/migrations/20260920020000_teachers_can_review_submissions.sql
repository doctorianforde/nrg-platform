-- Fix: teachers could not act on a student's submission.
--
-- 20260920010000 widened can_manage_question() so a student may edit their own
-- pending draft, but left the teacher branch as "your own question, or an
-- AI-generated one". A student submission is neither, so the review screen's
-- Approve silently affected 0 rows and no XP was ever awarded. Caught by the
-- end-to-end test before this reached production.
--
-- A teacher may now manage anything that is actually in review: their own
-- questions, the AI bank, and questions authored by a non-staff account. A
-- question authored by another *teacher* still stays with its author (or an admin),
-- which is the boundary the original policy was protecting.

CREATE OR REPLACE FUNCTION public.can_manage_question(q_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
      OR (public.user_role() = 'teacher'
          AND EXISTS (SELECT 1 FROM public.questions q
                      WHERE q.id = q_id
                        AND (
                          q.created_by = auth.uid()
                          OR q.is_ai_generated
                          -- A student submission. is_staff(NULL) is false, so this
                          -- also covers AI rows, which carry no author.
                          OR NOT public.is_staff(q.created_by)
                        )))
      OR (public.user_role() = 'student'
          AND EXISTS (SELECT 1 FROM public.questions q
                      WHERE q.id = q_id
                        AND q.created_by = auth.uid()
                        AND q.review_status = 'pending'
                        AND q.is_active = false))
$$;
