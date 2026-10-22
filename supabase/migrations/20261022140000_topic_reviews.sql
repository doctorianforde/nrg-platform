-- Topic reviews: Jade's 15 slide decks (Template 9), parsed by scripts/import-topic-reviews.ts into content/topic-reviews/
-- and stored here. They arrive as drafts; teaching staff read drafts and publish them, students read published ones.
-- keywords/exclude/related come from src/lib/topic-reviews/catalog.ts and drive the cross-links (Template 16): a question links to
-- the review whose keywords it matches best, and a review offers practice on the questions that match it.
--
-- Rollback: DROP FUNCTION public.topic_review_candidates(TEXT); DROP TABLE public.topic_reviews; (nothing else references it)

CREATE TABLE IF NOT EXISTS public.topic_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  title        TEXT NOT NULL,
  system       TEXT NOT NULL,
  slides       JSONB NOT NULL,
  question     JSONB,
  keywords     TEXT[] NOT NULL DEFAULT '{}',
  -- A question mentioning any of these never links here (e.g. pregnancy for the hypertension review).
  exclude      TEXT[] NOT NULL DEFAULT '{}',
  related      TEXT[] NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  source       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.topic_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topic_reviews: read published or staff" ON public.topic_reviews;
CREATE POLICY "topic_reviews: read published or staff" ON public.topic_reviews FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_teaching_staff());
DROP POLICY IF EXISTS "topic_reviews: staff publish" ON public.topic_reviews;
CREATE POLICY "topic_reviews: staff publish" ON public.topic_reviews FOR UPDATE TO authenticated
  USING (public.is_teaching_staff()) WITH CHECK (public.is_teaching_staff());
REVOKE ALL ON public.topic_reviews FROM anon, authenticated;
GRANT SELECT ON public.topic_reviews TO authenticated;
-- Staff change the status only; content comes from the importer (service role).
GRANT UPDATE (status) ON public.topic_reviews TO authenticated;

-- Who published and when is stamped here, not taken from the browser.
CREATE OR REPLACE FUNCTION public.stamp_topic_review_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' THEN
      NEW.published_at := now();
      NEW.published_by := auth.uid();
    ELSE
      NEW.published_at := NULL;
      NEW.published_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_topic_review_status ON public.topic_reviews;
CREATE TRIGGER trg_topic_review_status BEFORE UPDATE ON public.topic_reviews
  FOR EACH ROW EXECUTE FUNCTION public.stamp_topic_review_status();
REVOKE ALL ON FUNCTION public.stamp_topic_review_status() FROM PUBLIC, anon, authenticated;

-- Live standalone questions that mention any of a readable review's keywords (whole word, any case). A coarse superset:
-- the app scores these with the same rule as the question-side links (catalog.ts: acronyms exact, a score of 2, excludes)
-- before using them. Runs with the caller's rights, so a student only reaches a published review.
CREATE OR REPLACE FUNCTION public.topic_review_candidates(p_slug TEXT)
RETURNS TABLE (id UUID, body TEXT, topic_name TEXT)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH r AS (
    SELECT '(^|[^[:alnum:]])(' ||
           string_agg(regexp_replace(regexp_replace(k, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), '\s+', '\\s+', 'g'), '|') ||
           ')($|[^[:alnum:]])' AS pattern
      FROM public.topic_reviews tr, unnest(tr.keywords) k
     WHERE tr.slug = p_slug
  )
  SELECT q.id, q.body, t.name
    FROM public.questions q
    LEFT JOIN public.topics t ON t.id = q.topic_id, r
   WHERE q.is_active AND q.context = 'standalone' AND r.pattern IS NOT NULL
     AND (q.body ~* r.pattern OR COALESCE(t.name, '') ~* r.pattern);
$$;
REVOKE ALL ON FUNCTION public.topic_review_candidates(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topic_review_candidates(TEXT) TO authenticated;
