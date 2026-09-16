CREATE TABLE IF NOT EXISTS public.questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id       INT  NOT NULL REFERENCES public.domains(id),
  topic_id        INT  REFERENCES public.topics(id),
  body            TEXT NOT NULL,
  explanation     TEXT,
  cognitive_level TEXT CHECK (cognitive_level IN ('knowledge','comprehension','application','analysis')),
  difficulty      TEXT CHECK (difficulty IN ('easy','medium','hard')),
  question_type   TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','sata')),
  source          TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_q_domain  ON public.questions(domain_id);
CREATE INDEX IF NOT EXISTS idx_q_topic   ON public.questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_q_active  ON public.questions(is_active);
CREATE INDEX IF NOT EXISTS idx_q_type    ON public.questions(question_type);

CREATE TABLE IF NOT EXISTS public.question_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  is_correct    BOOLEAN NOT NULL,
  rationale     TEXT,
  display_order INT  NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qo_question ON public.question_options(question_id);

CREATE TABLE IF NOT EXISTS public.question_tags (
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  tag_id      INT  NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);
