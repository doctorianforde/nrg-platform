-- Negative-stem questions ("which statement needs further teaching", NOT/EXCEPT): the three distractors are true
-- statements, so they get their own rationale-view class instead of close/priority/incorrect (Ian, 2026-10-08).
ALTER TABLE public.question_options DROP CONSTRAINT IF EXISTS question_options_distractor_type_check;
ALTER TABLE public.question_options ADD CONSTRAINT question_options_distractor_type_check
  CHECK (distractor_type IS NULL OR distractor_type IN ('correct','close','priority','incorrect','not_asked'));
COMMENT ON COLUMN public.question_options.distractor_type IS 'Rationale-view colour class (Case Study V3 s.11): correct=green, close=yellow, priority (priority/sequencing)=orange, incorrect (incorrect/unsafe)=red, not_asked (negative-stem items: a true statement, not what the question asks)=blue/grey. NULL = not yet classified.';
