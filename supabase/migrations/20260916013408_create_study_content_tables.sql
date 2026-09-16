CREATE TABLE IF NOT EXISTS public.flashcards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   INT REFERENCES public.topics(id),
  front      TEXT NOT NULL,
  back       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fc_topic ON public.flashcards(topic_id);

CREATE TABLE IF NOT EXISTS public.case_studies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_scenario TEXT NOT NULL,
  domain_id         INT  REFERENCES public.domains(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction: each case study links to multiple questions from the main questions table
CREATE TABLE IF NOT EXISTS public.case_study_questions (
  case_study_id UUID NOT NULL REFERENCES public.case_studies(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES public.questions(id)    ON DELETE CASCADE,
  display_order INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (case_study_id, question_id)
);
