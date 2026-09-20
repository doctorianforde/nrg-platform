-- Profile pictures.
--
-- profiles.avatar_url has existed since T09 but nothing ever wrote to it. This adds
-- the bucket behind it. Files live at `<user_id>/avatar.<ext>`, so the first path
-- segment is the owner and a person can only write inside their own folder.
--
-- The bucket is public-read: an avatar is shown next to its owner's name wherever
-- they appear, so there is nothing to protect, and signed URLs would expire in the
-- middle of a page. Size and type are enforced by the bucket itself, not just the
-- upload form — 2 MB and images only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone may read an avatar; only the owner may write one.
DROP POLICY IF EXISTS "avatars: public read"       ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner insert"      ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner update"      ON storage.objects;
DROP POLICY IF EXISTS "avatars: owner or admin delete" ON storage.objects;

CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins clear up after an account they remove.
CREATE POLICY "avatars: owner or admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin())
  );
