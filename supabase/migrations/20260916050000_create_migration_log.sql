-- T28 (prep): migration_log + stable source id for idempotent content migration
--
-- questions.source_id holds the client's original question identifier (or a
-- deterministic hash of the stem when the source has no id) so re-running
-- scripts/migrate-questions.ts upserts instead of duplicating.

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_q_source_id
  ON public.questions(source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.migration_log (
  id         BIGSERIAL PRIMARY KEY,
  run_id     TEXT NOT NULL,                 -- one value per script invocation
  source_id  TEXT,
  status     TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
  message    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_migration_log_run    ON public.migration_log(run_id);
CREATE INDEX IF NOT EXISTS idx_migration_log_status ON public.migration_log(status);

-- Internal table: service role only. No policies → authenticated/anon see nothing.
ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;
