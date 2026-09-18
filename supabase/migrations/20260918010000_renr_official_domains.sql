-- Replace placeholder domains with the OFFICIAL RENR domains (from the client's
-- NRG Master Prompt Template, Sep 2026) and model the clinical study clusters
-- as a separate axis.
--
--   domains        = official RENR exam domains (NP, CDM, NLM, PC, HPMW, COM, PD)
--   topic_clusters = high-yield clinical study clusters from the 50-topic list
--   topics         = individual topics, each in one cluster; domain_id is now
--                    optional because a clinical topic (e.g. "Cardiac") spans
--                    several official domains
--   cognitive_level (questions) maps to the RENR taxonomy:
--                    KC = knowledge|comprehension · AP = application · ASE = analysis
--
-- Safe only while no questions exist — guarded below.

DO $$
BEGIN
  IF (SELECT count(*) FROM public.questions) > 0 THEN
    RAISE EXCEPTION 'questions table is not empty — re-map domains manually instead of reseeding';
  END IF;
END $$;

-- ── Study clusters ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.topic_clusters (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  share_pct     NUMERIC(4,1),          -- practical weighting of the 50-topic study list
  display_order INT
);
ALTER TABLE public.topic_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topic_clusters: authenticated read"
  ON public.topic_clusters FOR SELECT TO authenticated USING (true);
CREATE POLICY "topic_clusters: admin write"
  ON public.topic_clusters FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.topic_clusters (code, name, share_pct, display_order) VALUES
  ('MEDSURG',  'Medical-surgical and community health priorities', 30.0, 1),
  ('SAFETY',   'Safety, infection control, and core procedures',   22.0, 2),
  ('MATCHILD', 'Maternal-child and family nursing',                22.0, 3),
  ('MGMT',     'Management, legal, and professionalism',           14.0, 4),
  ('PSYCHSOC', 'Psychosocial and therapeutic communication',       12.0, 5)
ON CONFLICT (code) DO NOTHING;

-- ── Topics: attach to cluster, loosen domain FK ────────────────────────────
ALTER TABLE public.topics ALTER COLUMN domain_id DROP NOT NULL;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS cluster_id INT REFERENCES public.topic_clusters(id);
CREATE INDEX IF NOT EXISTS idx_topics_cluster ON public.topics(cluster_id);

-- ── Reseed domains ─────────────────────────────────────────────────────────
DELETE FROM public.topics;
DELETE FROM public.domains;
ALTER SEQUENCE public.domains_id_seq RESTART WITH 1;
ALTER SEQUENCE public.topics_id_seq  RESTART WITH 1;

INSERT INTO public.domains (name, code, exam_weight_pct, display_order) VALUES
  ('Nursing Practice',                              'NP',   30.0, 1),
  ('Clinical Decision Making and Intervention',     'CDM',  20.0, 2),
  ('Nursing Leadership and Management',             'NLM',  15.0, 3),
  ('Professional Conduct',                          'PC',   10.0, 4),
  ('Health Promotion and Maintenance of Wellness',  'HPMW', 10.0, 5),
  ('Communication',                                 'COM',  10.0, 6),
  ('Professional Development',                      'PD',    5.0, 7);

-- ── Topic scaffold from the cluster examples (client's 50-topic list) ──────
INSERT INTO public.topics (cluster_id, name, slug, is_active)
SELECT c.id, t.name, t.slug, true
FROM public.topic_clusters c
JOIN (VALUES
  ('MEDSURG',  'Cardiac',                    'medsurg-cardiac'),
  ('MEDSURG',  'Endocrine',                  'medsurg-endocrine'),
  ('MEDSURG',  'Renal',                      'medsurg-renal'),
  ('MEDSURG',  'Respiratory',                'medsurg-respiratory'),
  ('MEDSURG',  'Infectious disease',         'medsurg-infectious-disease'),
  ('MEDSURG',  'Trauma',                     'medsurg-trauma'),
  ('MEDSURG',  'Cancer',                     'medsurg-cancer'),
  ('SAFETY',   'PPE and infection control',  'safety-ppe-infection-control'),
  ('SAFETY',   'Medication safety',          'safety-medication-safety'),
  ('SAFETY',   'Dosage calculation',         'safety-dosage-calculation'),
  ('SAFETY',   'IV therapy',                 'safety-iv-therapy'),
  ('SAFETY',   'Oxygen therapy',             'safety-oxygen-therapy'),
  ('SAFETY',   'CPR',                        'safety-cpr'),
  ('SAFETY',   'Wound care',                 'safety-wound-care'),
  ('MATCHILD', 'Antenatal care',             'matchild-antenatal'),
  ('MATCHILD', 'Obstetric emergencies',      'matchild-obstetric-emergencies'),
  ('MATCHILD', 'Postpartum',                 'matchild-postpartum'),
  ('MATCHILD', 'Newborn',                    'matchild-newborn'),
  ('MATCHILD', 'Growth and development',     'matchild-growth-development'),
  ('MATCHILD', 'Pediatrics',                 'matchild-pediatrics'),
  ('MGMT',     'Nursing process',            'mgmt-nursing-process'),
  ('MGMT',     'Assessment',                 'mgmt-assessment'),
  ('MGMT',     'Prioritization',             'mgmt-prioritization'),
  ('MGMT',     'Delegation',                 'mgmt-delegation'),
  ('MGMT',     'Ethics',                     'mgmt-ethics'),
  ('MGMT',     'Legal practice',             'mgmt-legal-practice'),
  ('PSYCHSOC', 'Therapeutic responses',      'psychsoc-therapeutic-responses'),
  ('PSYCHSOC', 'Psychosis',                  'psychsoc-psychosis'),
  ('PSYCHSOC', 'Anxiety',                    'psychsoc-anxiety'),
  ('PSYCHSOC', 'Substance use',              'psychsoc-substance-use'),
  ('PSYCHSOC', 'Family counselling',         'psychsoc-family-counselling'),
  ('PSYCHSOC', 'Culture',                    'psychsoc-culture')
) AS t(cluster_code, name, slug) ON c.code = t.cluster_code
ON CONFLICT (slug) DO NOTHING;
