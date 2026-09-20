-- Group exams ("group challenge") + an optional exam timer.
--
-- Model, decided with Ian 2026-09-20: up to 5 students sit the SAME paper at the
-- same time and each answers for themselves. Every member still produces their own
-- `mock_exam_sessions` row, so scores, XP, rank, the study streak, the fatigue
-- report and every teacher analytic keep working with no change. A shared answer
-- sheet was rejected deliberately: one strong member would carry the rest, and rank
-- would stop meaning "is ready for RENR", which is the whole point of the product.
--
-- Groups can be formed two ways:
--   * a student creates one and shares a 6-character join code, or
--   * a teacher assigns one to named students (like the calendar's 'selected'
--     audience), and starts it themselves.
--
-- The timer is a set-level `duration_minutes`. It applies to solo attempts too, via
-- a BEFORE INSERT trigger, so timed solo exams come for free with no app change.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Optional duration on a set
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mock_exam_sets
  ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT;

DO $$ BEGIN
  ALTER TABLE public.mock_exam_sets
    ADD CONSTRAINT mock_exam_sets_duration_sane
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 600);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.mock_exam_sets.duration_minutes IS
  'NULL = untimed. Otherwise minutes allowed; resolved to an absolute deadline on each session at insert.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Groups
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exam_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       UUID NOT NULL REFERENCES public.mock_exam_sets(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  name         TEXT CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 120),
  join_code    TEXT NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z2-9]{6}$'),
  max_members  SMALLINT NOT NULL DEFAULT 5 CHECK (max_members BETWEEN 2 AND 5),
  status       TEXT NOT NULL DEFAULT 'lobby'
               CHECK (status IN ('lobby','running','finished','cancelled')),
  started_at   TIMESTAMPTZ,
  -- The shared deadline, resolved from the set's duration when the group starts.
  -- Stored rather than derived so that editing the set mid-exam cannot move a
  -- deadline that students are already racing.
  expires_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A lobby has not started, and a lobby abandoned before it started is
  -- cancelled without ever having a start time. Only running/finished must have one.
  CONSTRAINT exam_groups_started_when_running
    CHECK (status IN ('lobby','cancelled') OR started_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_eg_set     ON public.exam_groups(set_id);
CREATE INDEX IF NOT EXISTS idx_eg_creator ON public.exam_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_eg_status  ON public.exam_groups(status);

CREATE OR REPLACE TRIGGER trg_exam_groups_updated_at
  BEFORE UPDATE ON public.exam_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.exam_group_members (
  group_id   UUID NOT NULL REFERENCES public.exam_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id),
  -- Their own attempt. NULL until the group starts.
  session_id UUID REFERENCES public.mock_exam_sessions(id),
  is_owner   BOOLEAN NOT NULL DEFAULT false,
  -- true = a teacher put them here; false = they joined with the code.
  invited    BOOLEAN NOT NULL DEFAULT false,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_egm_student ON public.exam_group_members(student_id);
CREATE INDEX IF NOT EXISTS idx_egm_session ON public.exam_group_members(session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sessions learn about groups and deadlines
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mock_exam_sessions
  ADD COLUMN IF NOT EXISTS group_id   UUID REFERENCES public.exam_groups(id),
  -- Copied from the group (or derived from the set) so the answer-time RLS check
  -- is a single column on the row being written, with no join.
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meses_group ON public.mock_exam_sessions(group_id);
-- Finds sessions that ran out of time and were never closed.
CREATE INDEX IF NOT EXISTS idx_meses_expiring
  ON public.mock_exam_sessions(expires_at)
  WHERE completed_at IS NULL AND expires_at IS NOT NULL;

-- A solo attempt on a timed set gets its deadline here, so timed solo exams need
-- no application change. Group sessions arrive with expires_at already set to the
-- group's shared deadline, and are left alone.
CREATE OR REPLACE FUNCTION public.set_session_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Named v_mins, not mins: make_interval's own parameter is called mins, and
  -- make_interval(mins => mins) is ambiguous between the two.
  v_mins SMALLINT;
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT duration_minutes INTO v_mins FROM public.mock_exam_sets WHERE id = NEW.set_id;
  IF v_mins IS NOT NULL THEN
    NEW.expires_at := COALESCE(NEW.started_at, now()) + make_interval(mins => v_mins::INT);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_set_session_deadline
  BEFORE INSERT ON public.mock_exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_session_deadline();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helpers (SECURITY DEFINER so RLS policies can use them without recursing)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_exam_group_member(p_group UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exam_group_members m
    WHERE m.group_id = p_group AND m.student_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.exam_groups g
    WHERE g.id = p_group AND g.created_by = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_exam_group_member(UUID) TO authenticated;

-- Do I share any exam group with this person? Used to widen the profiles policy
-- just far enough that a lobby can show its members' names.
CREATE OR REPLACE FUNCTION public.shares_exam_group_with(p_other UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_group_members mine
    JOIN public.exam_group_members theirs ON theirs.group_id = mine.group_id
    WHERE mine.student_id = auth.uid() AND theirs.student_id = p_other
  ) OR EXISTS (
    -- The creator of a group I am in, and the members of a group I created.
    SELECT 1 FROM public.exam_groups g
    LEFT JOIN public.exam_group_members m ON m.group_id = g.id
    WHERE (g.created_by = auth.uid() AND m.student_id = p_other)
       OR (g.created_by = p_other AND m.student_id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION public.shares_exam_group_with(UUID) TO authenticated;

-- May the caller still write answers into this session? Ownership, not yet
-- submitted, and not past its deadline.
CREATE OR REPLACE FUNCTION public.session_accepts_answers(p_session UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mock_exam_sessions s
    WHERE s.id = p_session
      AND s.student_id = auth.uid()
      AND s.completed_at IS NULL
      AND (s.expires_at IS NULL OR now() <= s.expires_at)
  );
$$;
GRANT EXECUTE ON FUNCTION public.session_accepts_answers(UUID) TO authenticated;

-- 6 characters from an alphabet with no 0/O/1/I/L, so a code can be read aloud.
CREATE OR REPLACE FUNCTION public.new_join_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
BEGIN
  FOR attempt IN 1..20 LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
    END LOOP;
    -- Only codes for groups still open to joining need to be unique in practice,
    -- but the column is globally unique, so just retry on collision.
    IF NOT EXISTS (SELECT 1 FROM public.exam_groups WHERE join_code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'could not allocate a join code';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Capacity, and the race that makes a naive check wrong
-- ─────────────────────────────────────────────────────────────────────────────

-- A CHECK constraint cannot count sibling rows, and a trigger that simply counts
-- is racy: two students joining a 4-member group at the same time would both see
-- 4, both pass, and the group would end up with 6. Locking the group row first
-- serialises concurrent joins.
CREATE OR REPLACE FUNCTION public.enforce_exam_group_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap    SMALLINT;
  st     TEXT;
  s_id   UUID;
  n      INT;
BEGIN
  SELECT max_members, status, set_id INTO cap, st, s_id
    FROM public.exam_groups WHERE id = NEW.group_id
    FOR UPDATE;

  IF cap IS NULL THEN
    RAISE EXCEPTION 'group not found' USING ERRCODE = 'P0002';
  END IF;
  IF st <> 'lobby' THEN
    RAISE EXCEPTION 'this group has already started' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO n FROM public.exam_group_members WHERE group_id = NEW.group_id;
  IF n >= cap THEN
    RAISE EXCEPTION 'this group is full (% of %)', n, cap USING ERRCODE = '23514';
  END IF;

  -- Staff take part by running a group, not by sitting in it.
  IF public.is_staff(NEW.student_id) THEN
    RAISE EXCEPTION 'only students can be members of a group exam' USING ERRCODE = '42501';
  END IF;

  -- One live group per paper per student, so a student cannot hold open several
  -- lobbies for the same set and pick the most flattering result.
  IF EXISTS (
    SELECT 1
    FROM public.exam_group_members m
    JOIN public.exam_groups g ON g.id = m.group_id
    WHERE m.student_id = NEW.student_id
      AND m.group_id <> NEW.group_id
      AND g.set_id = s_id
      AND g.status IN ('lobby','running')
  ) THEN
    RAISE EXCEPTION 'already in a group for this exam' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_enforce_exam_group_capacity
  BEFORE INSERT ON public.exam_group_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_group_capacity();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Operations. All writes go through these, so no table needs a write policy.
-- ─────────────────────────────────────────────────────────────────────────────

-- A student opens a group on a paper and becomes its owner.
CREATE OR REPLACE FUNCTION public.create_exam_group(
  p_set_id UUID, p_name TEXT DEFAULT NULL, p_max_members SMALLINT DEFAULT 5
)
RETURNS public.exam_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.exam_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'staff should use assign_exam_group' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mock_exam_sets WHERE id = p_set_id AND is_active) THEN
    RAISE EXCEPTION 'exam set not available' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.exam_groups (set_id, created_by, name, join_code, max_members)
  VALUES (p_set_id, auth.uid(), nullif(btrim(p_name), ''), public.new_join_code(),
          GREATEST(2, LEAST(5, COALESCE(p_max_members, 5))))
  RETURNING * INTO g;

  INSERT INTO public.exam_group_members (group_id, student_id, is_owner)
  VALUES (g.id, auth.uid(), true);

  RETURN g;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_exam_group(UUID, TEXT, SMALLINT) TO authenticated;

-- Joining with a code. Capacity and status are enforced by the trigger above.
CREATE OR REPLACE FUNCTION public.join_exam_group(p_code TEXT)
RETURNS public.exam_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.exam_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO g FROM public.exam_groups
   WHERE join_code = upper(btrim(p_code)) AND status = 'lobby';
  IF g.id IS NULL THEN
    RAISE EXCEPTION 'no group is waiting on that code' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.exam_group_members (group_id, student_id)
  VALUES (g.id, auth.uid())
  ON CONFLICT (group_id, student_id) DO NOTHING;

  RETURN g;
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_exam_group(TEXT) TO authenticated;

-- A teacher sets one up for named students and starts it themselves.
CREATE OR REPLACE FUNCTION public.assign_exam_group(
  p_set_id UUID, p_student_ids UUID[], p_name TEXT DEFAULT NULL
)
RETURNS public.exam_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g   public.exam_groups;
  uid UUID;
  n   INT;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'teaching staff only' USING ERRCODE = '42501';
  END IF;
  n := coalesce(array_length(p_student_ids, 1), 0);
  IF n < 2 OR n > 5 THEN
    RAISE EXCEPTION 'a group exam takes between 2 and 5 students' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mock_exam_sets WHERE id = p_set_id AND is_active) THEN
    RAISE EXCEPTION 'exam set not available' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.exam_groups (set_id, created_by, name, join_code, max_members)
  VALUES (p_set_id, auth.uid(), nullif(btrim(p_name), ''), public.new_join_code(), n::SMALLINT)
  RETURNING * INTO g;

  FOREACH uid IN ARRAY p_student_ids LOOP
    INSERT INTO public.exam_group_members (group_id, student_id, invited)
    VALUES (g.id, uid, true)
    ON CONFLICT (group_id, student_id) DO NOTHING;
  END LOOP;

  RETURN g;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_exam_group(UUID, UUID[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_exam_group(p_group UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st TEXT;
BEGIN
  SELECT status INTO st FROM public.exam_groups WHERE id = p_group;
  IF st IS NULL THEN
    RAISE EXCEPTION 'group not found' USING ERRCODE = 'P0002';
  END IF;
  IF st <> 'lobby' THEN
    RAISE EXCEPTION 'the exam has started; you cannot leave now' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.exam_group_members
   WHERE group_id = p_group AND student_id = auth.uid();

  -- An empty lobby is cancelled rather than left as a ghost.
  IF NOT EXISTS (SELECT 1 FROM public.exam_group_members WHERE group_id = p_group) THEN
    UPDATE public.exam_groups SET status = 'cancelled' WHERE id = p_group;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.leave_exam_group(UUID) TO authenticated;

-- The start gate: one row per member, all sharing one deadline. That shared
-- deadline is what makes this synchronous rather than five solo attempts.
CREATE OR REPLACE FUNCTION public.start_exam_group(p_group UUID)
RETURNS public.exam_groups
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g        public.exam_groups;
  v_mins   SMALLINT;
  deadline TIMESTAMPTZ;
  m        RECORD;
  new_id   UUID;
BEGIN
  SELECT * INTO g FROM public.exam_groups WHERE id = p_group FOR UPDATE;
  IF g.id IS NULL THEN
    RAISE EXCEPTION 'group not found' USING ERRCODE = 'P0002';
  END IF;
  IF g.status <> 'lobby' THEN
    -- Idempotent: two members pressing Start at once must not double-create.
    RETURN g;
  END IF;

  -- The owner, the teacher who assigned it, or an admin.
  IF NOT (
    public.is_admin()
    OR g.created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.exam_group_members
                WHERE group_id = p_group AND student_id = auth.uid() AND is_owner)
  ) THEN
    RAISE EXCEPTION 'only the group owner can start the exam' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM public.exam_group_members WHERE group_id = p_group) < 2 THEN
    RAISE EXCEPTION 'a group exam needs at least 2 students' USING ERRCODE = '23514';
  END IF;

  SELECT duration_minutes INTO v_mins FROM public.mock_exam_sets WHERE id = g.set_id;
  deadline := CASE WHEN v_mins IS NULL THEN NULL
                   ELSE now() + make_interval(mins => v_mins::INT) END;

  UPDATE public.exam_groups
     SET status = 'running', started_at = now(), expires_at = deadline
   WHERE id = p_group
   RETURNING * INTO g;

  FOR m IN SELECT student_id FROM public.exam_group_members WHERE group_id = p_group LOOP
    INSERT INTO public.mock_exam_sessions (student_id, set_id, group_id, expires_at)
    VALUES (m.student_id, g.set_id, g.id, deadline)
    RETURNING id INTO new_id;

    UPDATE public.exam_group_members
       SET session_id = new_id
     WHERE group_id = p_group AND student_id = m.student_id;
  END LOOP;

  RETURN g;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_exam_group(UUID) TO authenticated;

-- Closing a session that has run out of time is mechanical: the deadline has
-- passed, so the score is already determined and nothing is taken away by writing
-- it down. This replaces the 20260920010000 version to allow exactly that one
-- extra case, so a teacher opening the group results page can settle a member who
-- shut their laptop. Everything before the deadline is unchanged: only the student
-- themselves, or an admin, may submit a live attempt.
CREATE OR REPLACE FUNCTION public.complete_mock_exam_session(p_session_id UUID)
RETURNS public.mock_exam_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sess    public.mock_exam_sessions;
  total   INT;
  correct INT;
  expired BOOLEAN;
BEGIN
  SELECT * INTO sess FROM public.mock_exam_sessions WHERE id = p_session_id;
  IF sess.id IS NULL THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  expired := sess.expires_at IS NOT NULL AND now() > sess.expires_at;

  IF auth.uid() IS NOT NULL
     AND sess.student_id <> auth.uid()
     AND NOT public.is_admin()
     AND NOT expired THEN
    RAISE EXCEPTION 'not your session' USING ERRCODE = '42501';
  END IF;
  IF sess.completed_at IS NOT NULL THEN
    RETURN sess;
  END IF;

  SELECT count(*) INTO total FROM public.mock_exam_set_questions WHERE set_id = sess.set_id;
  SELECT count(*) INTO correct FROM public.mock_exam_responses
   WHERE session_id = p_session_id AND is_correct;

  UPDATE public.mock_exam_sessions
     SET completed_at    = now(),
         total_questions = total,
         correct_count   = correct,
         score_pct       = CASE WHEN total = 0 THEN 0
                                ELSE round(correct::numeric * 100 / total, 2) END
   WHERE id = p_session_id
   RETURNING * INTO sess;

  PERFORM public.award_xp(
    sess.student_id, public.xp_for_mock_exam(sess.score_pct), 'mock_exam', sess.id
  );
  RETURN sess;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_mock_exam_session(UUID) TO authenticated;

-- Time's up. The browser normally submits when its countdown hits zero, but a
-- closed laptop must not leave a session open forever, so this also runs lazily
-- whenever a group or results page is read. Scoring and XP reuse
-- complete_mock_exam_session, so a timed-out attempt is paid exactly like any
-- other and never twice (xp_events is unique on (reason, source_id)).
CREATE OR REPLACE FUNCTION public.complete_expired_exam_sessions()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT s.id
      FROM public.mock_exam_sessions s
     WHERE s.completed_at IS NULL
       AND s.expires_at IS NOT NULL
       AND now() > s.expires_at
       -- A student heals their own; staff and the service role heal everything.
       AND (auth.uid() IS NULL OR public.is_staff(auth.uid()) OR s.student_id = auth.uid())
     LIMIT 500
  LOOP
    PERFORM public.complete_mock_exam_session(r.id);
    n := n + 1;
  END LOOP;

  UPDATE public.exam_groups g
     SET status = 'finished', finished_at = COALESCE(g.finished_at, now())
   WHERE g.status = 'running'
     AND NOT EXISTS (
       SELECT 1 FROM public.mock_exam_sessions s
        WHERE s.group_id = g.id AND s.completed_at IS NULL
     );

  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_expired_exam_sessions() TO authenticated;

-- When the last member submits, the group is done.
CREATE OR REPLACE FUNCTION public.close_group_when_all_done()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_id IS NOT NULL AND NEW.completed_at IS NOT NULL THEN
    UPDATE public.exam_groups g
       SET status = 'finished', finished_at = COALESCE(g.finished_at, now())
     WHERE g.id = NEW.group_id
       AND g.status = 'running'
       AND NOT EXISTS (
         SELECT 1 FROM public.mock_exam_sessions s
          WHERE s.group_id = g.id AND s.completed_at IS NULL
       );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_close_group_when_all_done
  AFTER UPDATE OF completed_at ON public.mock_exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.close_group_when_all_done();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.exam_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_group_members ENABLE ROW LEVEL SECURITY;

-- Reading a group: members, its creator, and staff. Plus a narrow window for
-- code lookup is NOT granted here — joining goes through join_exam_group, so a
-- student can never enumerate other people's groups by guessing codes in a SELECT.
DROP POLICY IF EXISTS "exam_groups: member, creator or staff read" ON public.exam_groups;
CREATE POLICY "exam_groups: member, creator or staff read"
  ON public.exam_groups FOR SELECT TO authenticated
  USING (
    public.is_exam_group_member(id)
    OR public.user_role() IN ('teacher','admin','super_admin')
  );

DROP POLICY IF EXISTS "exam_group_members: same group or staff read" ON public.exam_group_members;
CREATE POLICY "exam_group_members: same group or staff read"
  ON public.exam_group_members FOR SELECT TO authenticated
  USING (
    public.is_exam_group_member(group_id)
    OR public.user_role() IN ('teacher','admin','super_admin')
  );

-- No INSERT/UPDATE/DELETE policies on either table: every write is a
-- SECURITY DEFINER function above, which is what keeps capacity, status and the
-- students-only rule impossible to bypass from the client.
DROP POLICY IF EXISTS "exam_groups: admin delete" ON public.exam_groups;
CREATE POLICY "exam_groups: admin delete"
  ON public.exam_groups FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── answers must stop at the deadline ───────────────────────────────────────
-- Replaces the two T37 policies, which only checked completed_at. Without the
-- deadline here, a client could keep POSTing answers after its countdown ended.
DROP POLICY IF EXISTS "mock_exam_responses: student insert own open session" ON public.mock_exam_responses;
CREATE POLICY "mock_exam_responses: student insert own open session"
  ON public.mock_exam_responses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.session_accepts_answers(session_id));

DROP POLICY IF EXISTS "mock_exam_responses: student update own open session" ON public.mock_exam_responses;
CREATE POLICY "mock_exam_responses: student update own open session"
  ON public.mock_exam_responses FOR UPDATE TO authenticated
  USING      (public.is_admin() OR public.session_accepts_answers(session_id))
  WITH CHECK (public.is_admin() OR public.session_accepts_answers(session_id));

-- ── reading a group-mate's result ───────────────────────────────────────────
-- The shared results screen shows each member's score. Scores only — responses
-- stay private, so nobody can mine a group-mate's answers.
DROP POLICY IF EXISTS "mock_exam_sessions: own or teacher+ read" ON public.mock_exam_sessions;
CREATE POLICY "mock_exam_sessions: own, group-mate, or teacher+ read"
  ON public.mock_exam_sessions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.user_role() IN ('teacher','admin','super_admin')
    OR (group_id IS NOT NULL AND public.is_exam_group_member(group_id))
  );

-- ── names in the lobby ──────────────────────────────────────────────────────
-- Same shape as the messaging change in 20260919020000/30000: widen just enough
-- to show the people you are actually sitting an exam with.
DROP POLICY IF EXISTS "profiles: read own, admin any, students for staff, or shared thread" ON public.profiles;
CREATE POLICY "profiles: read own, admin any, students for staff, shared thread or exam group"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
    OR (public.user_role() = 'teacher' AND role = 'student')
    OR public.shares_thread_with(id)
    OR public.shares_exam_group_with(id)
  );
