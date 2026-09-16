-- Partial index for active questions only (most queries filter by is_active=true)
CREATE INDEX IF NOT EXISTS idx_q_active_domain
  ON public.questions(domain_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_q_active_topic
  ON public.questions(topic_id) WHERE is_active = true;

-- Composite index for question listing (domain + type + active)
CREATE INDEX IF NOT EXISTS idx_q_domain_type
  ON public.questions(domain_id, question_type) WHERE is_active = true;

-- Profiles role lookup (used in every RLS policy)
-- Already created in T09; verified as idx_profiles_role ON public.profiles(role)
