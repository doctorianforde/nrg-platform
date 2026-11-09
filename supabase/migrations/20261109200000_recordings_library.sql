-- Recordings library, phase 1 (Ian, 2026-11-09; build plan: Claude Doc "NRG Recordings Library: Build Plan").
-- Past recordings and lectures for paid plans, with free samples, modelled on the reference journal site's video
-- library. Phase 1 stores videos privately in Supabase Storage (bucket `recordings`) and plays them through expiring
-- signed links made on the server after recording_playback_allowed() says yes; phase 2 swaps in a video host
-- (`host` + `host_ref`), with no change to these tables.
--
-- Who sees what: everyone signed in sees published recordings' details (free students see paid ones locked); staff
-- also see drafts. Who plays what: staff everything; students published free samples, and everything published while
-- on a paid plan (effective_tier(), so access ends with the plan). Progress is saved only through
-- save_recording_progress() for the caller's own account.
--
-- Additive. ROLLBACK: drop the three functions, the four tables, and the two buckets with their storage policies.

CREATE TABLE IF NOT EXISTS public.recordings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  title             TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  kind              TEXT NOT NULL CHECK (kind IN ('lecture', 'session', 'short')),
  presenter         TEXT,
  recorded_on       DATE,
  description       TEXT,
  notes             TEXT,                         -- written summary (Notes tab)
  transcript        JSONB NOT NULL DEFAULT '[]',  -- [{ "t": seconds, "text": "..." }] (Transcript tab, click to jump)
  thumbnail_path    TEXT,                         -- in the public `recording-thumbnails` bucket
  duration_seconds  INT NOT NULL CHECK (duration_seconds > 0),
  host              TEXT NOT NULL DEFAULT 'supabase' CHECK (host IN ('supabase', 'cloudflare', 'bunny')),
  host_ref          TEXT NOT NULL,                -- storage path (supabase) or the host's video id
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  free_sample       BOOLEAN NOT NULL DEFAULT false,
  consent_confirmed BOOLEAN NOT NULL DEFAULT false,  -- live-session recordings: everyone agreed, or nobody identifiable
  domain_id         INT REFERENCES public.domains(id),
  cognitive_level   TEXT CHECK (cognitive_level IN ('knowledge', 'application', 'analysis')),
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ,
  -- A recording of a live session can't be published until consent is confirmed.
  CONSTRAINT recordings_session_consent CHECK (status <> 'published' OR kind <> 'session' OR consent_confirmed)
);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON public.recordings (status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.recording_chapters (
  recording_id  UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  position      INT NOT NULL CHECK (position >= 0),
  start_seconds INT NOT NULL CHECK (start_seconds >= 0),
  title         TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  PRIMARY KEY (recording_id, position)
);

CREATE TABLE IF NOT EXISTS public.recording_links (
  recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  review_slug  TEXT NOT NULL REFERENCES public.topic_reviews(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (recording_id, review_slug)
);

CREATE TABLE IF NOT EXISTS public.recording_progress (
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recording_id     UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  position_seconds INT NOT NULL DEFAULT 0,
  furthest_seconds INT NOT NULL DEFAULT 0,
  watched_at       TIMESTAMPTZ,                  -- set once the student has reached 90%
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recording_id)
);

-- ── Row-level security ────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recordings: read published or staff" ON public.recordings;
CREATE POLICY "recordings: read published or staff" ON public.recordings FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_teaching_staff());
DROP POLICY IF EXISTS "recordings: staff write" ON public.recordings;
CREATE POLICY "recordings: staff write" ON public.recordings FOR ALL TO authenticated
  USING (public.is_teaching_staff()) WITH CHECK (public.is_teaching_staff());

DROP POLICY IF EXISTS "recording_chapters: read with recording" ON public.recording_chapters;
CREATE POLICY "recording_chapters: read with recording" ON public.recording_chapters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = recording_id AND (r.status = 'published' OR public.is_teaching_staff())));
DROP POLICY IF EXISTS "recording_chapters: staff write" ON public.recording_chapters;
CREATE POLICY "recording_chapters: staff write" ON public.recording_chapters FOR ALL TO authenticated
  USING (public.is_teaching_staff()) WITH CHECK (public.is_teaching_staff());

DROP POLICY IF EXISTS "recording_links: read with recording" ON public.recording_links;
CREATE POLICY "recording_links: read with recording" ON public.recording_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = recording_id AND (r.status = 'published' OR public.is_teaching_staff())));
DROP POLICY IF EXISTS "recording_links: staff write" ON public.recording_links;
CREATE POLICY "recording_links: staff write" ON public.recording_links FOR ALL TO authenticated
  USING (public.is_teaching_staff()) WITH CHECK (public.is_teaching_staff());

DROP POLICY IF EXISTS "recording_progress: own or staff read" ON public.recording_progress;
CREATE POLICY "recording_progress: own or staff read" ON public.recording_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teaching_staff());

REVOKE ALL ON public.recordings, public.recording_chapters, public.recording_links, public.recording_progress FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordings, public.recording_chapters, public.recording_links TO authenticated;  -- staff only, by policy
GRANT SELECT ON public.recording_progress TO authenticated;                                                                     -- writes via the function

-- ── Storage ───────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recordings', 'recordings', false, 52428800, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800, allowed_mime_types = ARRAY['video/mp4'];
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recording-thumbnails', 'recording-thumbnails', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "recordings: staff upload" ON storage.objects;
DROP POLICY IF EXISTS "recordings: staff read" ON storage.objects;
DROP POLICY IF EXISTS "recordings: staff delete" ON storage.objects;
DROP POLICY IF EXISTS "recording-thumbnails: staff write" ON storage.objects;
DROP POLICY IF EXISTS "recording-thumbnails: staff delete" ON storage.objects;
-- Videos: staff upload and read; students never read the bucket directly (the server signs a short-lived link).
CREATE POLICY "recordings: staff upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings' AND public.is_teaching_staff());
CREATE POLICY "recordings: staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recordings' AND public.is_teaching_staff());
CREATE POLICY "recordings: staff delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recordings' AND public.is_teaching_staff());
-- Thumbnails are public images (not sensitive); only staff add or remove them.
CREATE POLICY "recording-thumbnails: staff write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recording-thumbnails' AND public.is_teaching_staff());
CREATE POLICY "recording-thumbnails: staff delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recording-thumbnails' AND public.is_teaching_staff());

-- ── Functions ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- May the caller play this recording? The server asks this with the caller's own token before signing a link.
CREATE OR REPLACE FUNCTION public.recording_playback_allowed(p_recording UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_teaching_staff() THEN EXISTS (SELECT 1 FROM public.recordings WHERE id = p_recording)
    ELSE EXISTS (
      SELECT 1 FROM public.recordings r
       WHERE r.id = p_recording AND r.status = 'published'
         AND (r.free_sample OR public.effective_tier(auth.uid()) IN ('standard', 'premium')))
  END
$$;
REVOKE ALL ON FUNCTION public.recording_playback_allowed(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recording_playback_allowed(UUID) TO authenticated;

-- Save the caller's place. Positions are clamped to the recording's length; furthest only moves forward; 90% marks
-- it watched once. Only for recordings the caller may play.
CREATE OR REPLACE FUNCTION public.save_recording_progress(p_recording UUID, p_position INT)
RETURNS public.recording_progress
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  len INT;
  pos INT;
  row public.recording_progress;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF NOT public.recording_playback_allowed(p_recording) THEN RAISE EXCEPTION 'not available on your plan' USING ERRCODE = '42501'; END IF;
  SELECT duration_seconds INTO len FROM public.recordings WHERE id = p_recording;
  pos := LEAST(GREATEST(COALESCE(p_position, 0), 0), len);
  INSERT INTO public.recording_progress (user_id, recording_id, position_seconds, furthest_seconds, watched_at, updated_at)
  VALUES (uid, p_recording, pos, pos, CASE WHEN pos >= 0.9 * len THEN now() END, now())
  ON CONFLICT (user_id, recording_id) DO UPDATE SET
    position_seconds = pos,
    furthest_seconds = GREATEST(public.recording_progress.furthest_seconds, pos),
    watched_at = COALESCE(public.recording_progress.watched_at, CASE WHEN GREATEST(public.recording_progress.furthest_seconds, pos) >= 0.9 * len THEN now() END),
    updated_at = now()
  RETURNING * INTO row;
  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.save_recording_progress(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recording_progress(UUID, INT) TO authenticated;

-- Staff: replace a recording's chapters and topic-review links in one go (the teacher form saves them as lists).
CREATE OR REPLACE FUNCTION public.set_recording_details(p_recording UUID, p_chapters JSONB, p_reviews TEXT[])
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_teaching_staff() THEN RAISE EXCEPTION 'staff only' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.recording_chapters WHERE recording_id = p_recording;
  INSERT INTO public.recording_chapters (recording_id, position, start_seconds, title)
  SELECT p_recording, (c.ord - 1)::int, (c.v ->> 'start')::int, btrim(c.v ->> 'title')
    FROM jsonb_array_elements(COALESCE(p_chapters, '[]'::jsonb)) WITH ORDINALITY AS c(v, ord);
  DELETE FROM public.recording_links WHERE recording_id = p_recording;
  INSERT INTO public.recording_links (recording_id, review_slug)
  SELECT DISTINCT p_recording, s FROM unnest(COALESCE(p_reviews, '{}')) s
   WHERE EXISTS (SELECT 1 FROM public.topic_reviews WHERE slug = s);
  UPDATE public.recordings SET updated_at = now() WHERE id = p_recording;
END;
$$;
REVOKE ALL ON FUNCTION public.set_recording_details(UUID, JSONB, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_recording_details(UUID, JSONB, TEXT[]) TO authenticated;
