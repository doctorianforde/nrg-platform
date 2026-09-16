-- T14: Topic scaffolding — one representative topic per domain so domain→topic
-- foreign keys can be exercised in Weeks 1–2. The full ~650-topic list is
-- inserted by the Week 3 migration script (T28) from the client's content.
INSERT INTO public.topics (domain_id, name, slug, is_active)
SELECT d.id, t.name, t.slug, true
FROM public.domains d
JOIN (VALUES
  ('MCH',   'Antepartum Care',           'mch-antepartum'),
  ('MED',   'Cardiovascular Disorders',  'med-cardiovascular'),
  ('PSYCH', 'Mood Disorders',            'psych-mood'),
  ('COMM',  'Epidemiology',              'comm-epidemiology'),
  ('CRIT',  'Haemodynamic Monitoring',   'crit-haemodynamic'),
  ('FUND',  'Infection Control',         'fund-infection-control'),
  ('PHARM', 'Analgesics',                'pharm-analgesics')
) AS t(code, name, slug) ON d.code = t.code
ON CONFLICT (slug) DO NOTHING;
