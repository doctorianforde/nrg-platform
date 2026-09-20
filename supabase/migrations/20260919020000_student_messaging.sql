-- Student ↔ teacher messaging, for the student profile section.
--
-- Shape: a student opens a thread, optionally citing one of their own mock exam
-- attempts, and teaching staff reply in it. Threads are student-initiated only —
-- staff cannot start one, because staff cannot browse the student list (see the
-- profiles policy below). Messages are append-only so the feedback record stands.

CREATE TABLE IF NOT EXISTS public.message_threads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject               TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
  -- Optional context: the attempt the student is asking about.
  session_id            UUID REFERENCES public.mock_exam_sessions(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','answered','closed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- How far each side has read. Unread = messages after this, by the other side.
  student_last_read_at  TIMESTAMPTZ,
  staff_last_read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mt_student ON public.message_threads(student_id);
CREATE INDEX IF NOT EXISTS idx_mt_recent  ON public.message_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_mt_status  ON public.message_threads(status);

CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES auth.users(id),
  body       TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON public.messages(thread_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- True when the given user is teaching staff. SECURITY DEFINER so it can be used
-- inside a policy on profiles without the policy recursing into itself.
CREATE OR REPLACE FUNCTION public.is_staff(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = uid AND p.role IN ('teacher','admin','super_admin')
  )
$$;

-- True when the caller and `other` share a conversation, in either direction:
--   * the caller is staff and `other` is a student who has opened a thread, or
--   * `other` has written in one of the caller's own threads.
-- This is what lets each side see the other's name, and nothing wider.
CREATE OR REPLACE FUNCTION public.shares_thread_with(other UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_threads t
     WHERE t.student_id = other
       AND public.user_role() IN ('teacher','admin','super_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.messages m
      JOIN public.message_threads t ON t.id = m.thread_id
     WHERE m.author_id = other AND t.student_id = auth.uid()
  )
$$;

-- A cited attempt must belong to the student who owns the thread.
CREATE OR REPLACE FUNCTION public.validate_thread_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.mock_exam_sessions s
     WHERE s.id = NEW.session_id AND s.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'cited attempt does not belong to this student' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_validate_thread_session
  BEFORE INSERT OR UPDATE OF session_id, student_id ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.validate_thread_session();

-- Posting bumps the thread, flips its status, and marks the author caught up.
CREATE OR REPLACE FUNCTION public.touch_message_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_staff BOOLEAN := public.is_staff(NEW.author_id);
BEGIN
  UPDATE public.message_threads
     SET last_message_at      = NEW.created_at,
         status               = CASE WHEN status = 'closed' THEN 'closed'
                                     WHEN from_staff THEN 'answered' ELSE 'open' END,
         staff_last_read_at   = CASE WHEN from_staff THEN NEW.created_at
                                     ELSE staff_last_read_at END,
         student_last_read_at = CASE WHEN from_staff THEN student_last_read_at
                                     ELSE NEW.created_at END
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_touch_message_thread
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_message_thread();

-- Marking a thread read. An RPC rather than an UPDATE policy, so neither side
-- needs write access to the threads table itself.
CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner UUID;
BEGIN
  SELECT student_id INTO owner FROM public.message_threads WHERE id = p_thread_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = 'P0002';
  END IF;

  IF owner = auth.uid() THEN
    UPDATE public.message_threads SET student_last_read_at = now() WHERE id = p_thread_id;
  ELSIF public.user_role() IN ('teacher','admin','super_admin') THEN
    UPDATE public.message_threads SET staff_last_read_at = now() WHERE id = p_thread_id;
  ELSE
    RAISE EXCEPTION 'not your thread' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_thread_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.shares_thread_with(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_thread_with(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_threads: own or staff read"
  ON public.message_threads FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.user_role() IN ('teacher','admin','super_admin'));

-- Student-initiated only. Staff reply inside a thread; they never open one,
-- because they cannot see the roster of students who have not written in.
CREATE POLICY "message_threads: student opens own"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "message_threads: admin delete"
  ON public.message_threads FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "messages: read within a visible thread"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.message_threads t
     WHERE t.id = thread_id
       AND (t.student_id = auth.uid() OR public.user_role() IN ('teacher','admin','super_admin'))
  ));

-- You may only post as yourself, into a thread you own or staff into any open one.
CREATE POLICY "messages: post as self into a visible thread"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
       WHERE t.id = thread_id
         AND t.status <> 'closed'
         AND (t.student_id = auth.uid() OR public.user_role() IN ('teacher','admin','super_admin'))
    )
  );

CREATE POLICY "messages: admin delete"
  ON public.messages FOR DELETE TO authenticated
  USING (public.is_admin());

-- Append-only: no UPDATE grant or policy on either table. Read state is tracked
-- through mark_thread_read().
REVOKE ALL ON public.message_threads FROM anon, authenticated;
REVOKE ALL ON public.messages        FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_threads TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages        TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: names become visible only along a shared conversation
-- ─────────────────────────────────────────────────────────────────────────────
-- Previously: your own row, or anything if you are an admin. A teacher could not
-- see who was writing to them, and a student could not see who had replied.
DROP POLICY IF EXISTS "profiles: read own or admin any" ON public.profiles;

CREATE POLICY "profiles: read own, admin any, or shared thread"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR public.shares_thread_with(id)
  );
