-- domains: 7 RENR nursing exam domains
CREATE TABLE IF NOT EXISTS public.domains (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  code           TEXT NOT NULL UNIQUE,
  exam_weight_pct NUMERIC(4,1),
  display_order  INT
);

-- topics: clinical categories within each domain (~650 total)
CREATE TABLE IF NOT EXISTS public.topics (
  id          SERIAL PRIMARY KEY,
  domain_id   INT NOT NULL REFERENCES public.domains(id),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_topics_domain ON public.topics(domain_id);

-- tags: free-form keyword tags for questions
CREATE TABLE IF NOT EXISTS public.tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
