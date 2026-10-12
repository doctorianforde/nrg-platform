-- Case studies: a structured medications block per stage (drug, dose, route, frequency, status), revealed with the stage
-- like vitals, assessment and labs. Ian's feedback 2026-10-12. Additive; existing rows get an empty list.
ALTER TABLE public.case_stages ADD COLUMN IF NOT EXISTS medications jsonb NOT NULL DEFAULT '[]'::jsonb;
