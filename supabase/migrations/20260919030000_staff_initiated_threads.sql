-- Let teaching staff start a conversation, not only reply.
--
-- Picking a student to write to means seeing the student list, so this widens the
-- profiles policy set in 20260919020000: a teacher may now read every STUDENT
-- profile, not only students who have already written in. Staff profiles stay
-- private to each other — a teacher still cannot read another teacher's or an
-- admin's row, and students still see staff names only along a shared thread.

-- A thread's owner must be an actual student, whoever opened it.
CREATE OR REPLACE FUNCTION public.validate_thread_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_staff(NEW.student_id) THEN
    RAISE EXCEPTION 'a thread must belong to a student' USING ERRCODE = '42501';
  END IF;

  IF NEW.session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.mock_exam_sessions s
     WHERE s.id = NEW.session_id AND s.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'cited attempt does not belong to this student' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Staff may open a thread for any student. Students may still only open their own
-- (policy from 20260919020000 is left in place; INSERT passes if either allows it).
CREATE POLICY "message_threads: staff opens for a student"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('teacher','admin','super_admin'));

DROP POLICY IF EXISTS "profiles: read own, admin any, or shared thread" ON public.profiles;

CREATE POLICY "profiles: read own, admin any, students for staff, or shared thread"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
    -- The roster, so staff can choose who to write to. Students only.
    OR (public.user_role() = 'teacher' AND role = 'student')
    -- Both directions of an existing conversation (students seeing staff names).
    OR public.shares_thread_with(id)
  );
