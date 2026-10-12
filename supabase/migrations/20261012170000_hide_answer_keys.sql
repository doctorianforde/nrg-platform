-- Answer keys are no longer readable with a user token.
--
-- Until now every signed-in user could read is_correct, option rationales and explanations for every question
-- (question_options had an open read policy for tutor mode), so a student could look up the answers to a promotion
-- quiz or an open mock exam through the API. Column privileges now withhold those columns from `anon` and
-- `authenticated`. Everything that legitimately needs them already runs with elevated rights:
--   - grading and awards: grade_mock_exam_response, record_practice_answers, answer_case_question, promotion_* (SECURITY DEFINER)
--   - the app server: tutor mode reveals one question after it is answered (revealPracticeAnswer), finished mock results
--     and finished cases attach keys server-side, staff pages read them after the role check (service client, server-only).
-- Writes are unchanged (teachers still edit keys and explanations; students still submit questions): only SELECT is narrowed.

REVOKE SELECT ON public.question_options FROM anon, authenticated;
GRANT SELECT (id, question_id, body, display_order) ON public.question_options TO authenticated;

REVOKE SELECT ON public.questions FROM anon, authenticated;
GRANT SELECT (id, domain_id, topic_id, body, cognitive_level, difficulty, question_type, source, is_ai_generated, is_active,
              created_by, created_at, updated_at, fts, source_id, review_status, reviewed_by, reviewed_at, review_notes, context)
  ON public.questions TO authenticated;
