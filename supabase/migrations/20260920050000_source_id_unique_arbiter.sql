-- T28 fix: the partial unique index on questions.source_id cannot act as an
-- ON CONFLICT arbiter, so every upsert via PostgREST failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (discovered 2026-09-20 during the prototype-bank import;
-- the run reported success=0 / error=4728 and wrote nothing).
--
-- A plain (non-partial) unique index still permits multiple NULL rows —
-- Postgres treats NULLs as distinct by default — so semantics are unchanged
-- for rows without a source_id, and ON CONFLICT (source_id) becomes usable.
-- Idempotent: safe if a later `db push` re-applies it.

DROP INDEX IF EXISTS public.idx_q_source_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_q_source_id
  ON public.questions(source_id);
