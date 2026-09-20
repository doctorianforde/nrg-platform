import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  hasUnread,
  type CitedAttempt,
  type ThreadMessage,
  type ThreadStatus,
  type ThreadSummary,
} from "./types";

type Db = SupabaseClient<Database>;

const THREAD_COLUMNS =
  "id, student_id, subject, status, created_at, last_message_at, student_last_read_at, staff_last_read_at, session_id";

type ThreadRow = {
  id: string;
  student_id: string;
  subject: string;
  status: string;
  created_at: string;
  last_message_at: string;
  student_last_read_at: string | null;
  staff_last_read_at: string | null;
  session_id: string | null;
};

/**
 * Names for a set of user ids.
 *
 * RLS only returns the rows the caller shares a conversation with, so anyone
 * missing is simply rendered under a role label rather than a name.
 */
async function namesFor(supabase: Db, ids: string[]): Promise<Map<string, { name: string | null; staff: boolean }>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name, role").in("id", unique);
  return new Map(
    (data ?? []).map((p) => [
      p.id,
      { name: p.full_name, staff: p.role !== "student" },
    ])
  );
}

async function attemptsFor(supabase: Db, sessionIds: string[]): Promise<Map<string, CitedAttempt>> {
  const unique = Array.from(new Set(sessionIds)).filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("mock_exam_sessions")
    .select("id, score_pct, completed_at, mock_exam_sets(title)")
    .in("id", unique);
  return new Map(
    (data ?? []).map((s) => [
      s.id,
      {
        sessionId: s.id,
        title: s.mock_exam_sets?.title ?? "Mock exam",
        scorePct: s.score_pct,
        completedAt: s.completed_at,
      },
    ])
  );
}

async function decorate(
  supabase: Db,
  rows: ThreadRow[],
  viewingAsStaff: boolean,
  viewerId: string
): Promise<ThreadSummary[]> {
  // Staff see who opened the thread; a student sees whoever last replied to them.
  let counterpart = new Map<string, string | null>();
  if (viewingAsStaff) {
    const names = await namesFor(supabase, rows.map((r) => r.student_id));
    counterpart = new Map(rows.map((r) => [r.id, names.get(r.student_id)?.name ?? null]));
  } else if (rows.length > 0) {
    const { data: replies } = await supabase
      .from("messages")
      .select("thread_id, author_id, created_at")
      .in("thread_id", rows.map((r) => r.id))
      .neq("author_id", viewerId)
      .order("created_at", { ascending: false });
    const latest = new Map<string, string>();
    for (const m of replies ?? []) if (!latest.has(m.thread_id)) latest.set(m.thread_id, m.author_id);
    const names = await namesFor(supabase, Array.from(latest.values()));
    counterpart = new Map(rows.map((r) => [r.id, names.get(latest.get(r.id) ?? "")?.name ?? null]));
  }

  const attempts = await attemptsFor(
    supabase,
    rows.map((r) => r.session_id).filter((id): id is string => id !== null)
  );

  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    subject: r.subject,
    status: r.status as ThreadStatus,
    createdAt: r.created_at,
    lastMessageAt: r.last_message_at,
    unread: hasUnread(r, viewingAsStaff),
    counterpartName: counterpart.get(r.id) ?? null,
    attempt: r.session_id ? attempts.get(r.session_id) ?? null : null,
  }));
}

/**
 * Threads for the caller, newest activity first.
 *
 * A staff view is the whole inbox; a personal view is always "threads I opened",
 * pinned to the viewer rather than left to RLS. Staff can read every thread, so a
 * teacher opening the student profile page would otherwise be shown the entire
 * inbox as if it were their own correspondence.
 */
export async function loadThreads(
  supabase: Db,
  viewerId: string,
  viewingAsStaff: boolean
): Promise<ThreadSummary[]> {
  let query = supabase
    .from("message_threads")
    .select(THREAD_COLUMNS)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (!viewingAsStaff) query = query.eq("student_id", viewerId);
  const { data } = await query;
  return decorate(supabase, (data ?? []) as ThreadRow[], viewingAsStaff, viewerId);
}

/** One conversation with its messages, or null when it isn't visible to the caller. */
export async function loadThread(
  supabase: Db,
  threadId: string,
  viewerId: string,
  viewingAsStaff: boolean
): Promise<{ thread: ThreadSummary; messages: ThreadMessage[] } | null> {
  const { data: row } = await supabase
    .from("message_threads")
    .select(THREAD_COLUMNS)
    .eq("id", threadId)
    .maybeSingle();
  if (!row) return null;
  // Same reason as loadThreads: a personal view only ever shows your own thread.
  if (!viewingAsStaff && row.student_id !== viewerId) return null;

  const { data: rawMessages } = await supabase
    .from("messages")
    .select("id, body, created_at, author_id")
    .eq("thread_id", threadId)
    .order("created_at");

  const names = await namesFor(supabase, (rawMessages ?? []).map((m) => m.author_id));
  const [thread] = await decorate(supabase, [row as ThreadRow], viewingAsStaff, viewerId);

  const messages: ThreadMessage[] = (rawMessages ?? []).map((m) => {
    const who = names.get(m.author_id);
    const fromStaff = who?.staff ?? m.author_id !== row.student_id;
    return {
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      authorId: m.author_id,
      authorName: who?.name ?? (fromStaff ? "Teaching staff" : "Student"),
      fromStaff,
      mine: m.author_id === viewerId,
    };
  });

  return { thread, messages };
}

/** Completed attempts a student can cite when opening a thread. */
export async function loadCitableAttempts(supabase: Db, studentId: string): Promise<CitedAttempt[]> {
  const { data } = await supabase
    .from("mock_exam_sessions")
    .select("id, score_pct, completed_at, mock_exam_sets(title)")
    .eq("student_id", studentId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(25);
  return (data ?? []).map((s) => ({
    sessionId: s.id,
    title: s.mock_exam_sets?.title ?? "Mock exam",
    scorePct: s.score_pct,
    completedAt: s.completed_at,
  }));
}

export type RosterStudent = { id: string; name: string };

/**
 * Students a staff member can write to.
 *
 * Names come from the signup form; anyone who never set one is shown with a short
 * id fragment so two unnamed students are still tellable apart.
 */
export async function loadStudentRoster(supabase: Db): Promise<RosterStudent[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .order("full_name", { nullsFirst: false })
    .limit(500);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name?.trim() || `Unnamed student (${p.id.slice(0, 6)})`,
  }));
}
