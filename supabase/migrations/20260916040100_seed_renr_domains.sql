-- T13: Seed the 7 RENR clinical domains
-- Weights are PLACEHOLDERS pending the official RENR blueprint from the client
-- (Jade Nicome). Update via a follow-up migration once confirmed. They sum to 100.0.
INSERT INTO public.domains (name, code, exam_weight_pct, display_order) VALUES
  ('Maternal & Child Health',       'MCH',   18.0, 1),
  ('Medical-Surgical Nursing',      'MED',   25.0, 2),
  ('Psychiatric Nursing',           'PSYCH', 12.0, 3),
  ('Community Health Nursing',      'COMM',  10.0, 4),
  ('Critical Care & Emergency',     'CRIT',  15.0, 5),
  ('Fundamentals of Nursing',       'FUND',  12.0, 6),
  ('Pharmacology & Drug Therapy',   'PHARM',  8.0, 7)
ON CONFLICT (code) DO NOTHING;
