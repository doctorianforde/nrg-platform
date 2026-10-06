-- Rationale-view colour class per option (MCQ standard v0.1 / Case Study V3 s.11).
-- Applied to staging 2026-10-04 via the MCP connector; this file records it so prod can receive it.
ALTER TABLE public.question_options
  ADD COLUMN IF NOT EXISTS distractor_type text
  CONSTRAINT question_options_distractor_type_check
  CHECK (distractor_type IS NULL OR distractor_type IN ('correct','close','priority','incorrect'));
COMMENT ON COLUMN public.question_options.distractor_type IS 'Rationale-view colour class (Case Study V3 s.11): correct=green, close=yellow, priority (priority/sequencing)=orange, incorrect (incorrect/unsafe)=red. NULL = not yet classified.';
