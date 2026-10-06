-- Snapshot of AI-bank option rationales before the rationale rewrite (applied to staging 2026-10-04).
-- On prod it snapshots the original AI rationales. Drop once the rewrite is accepted.
CREATE TABLE public._backup_ai_option_rationales_20261004 AS
SELECT o.id AS option_id, q.source_id, o.display_order, o.rationale AS old_rationale, o.distractor_type AS old_type
FROM public.question_options o JOIN public.questions q ON q.id=o.question_id
WHERE q.source_id LIKE 'ai:%';
ALTER TABLE public._backup_ai_option_rationales_20261004 ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public._backup_ai_option_rationales_20261004 IS 'Pre-rewrite rationales for the AI bank (2026-10-04). Drop once the rewrite is accepted.';
