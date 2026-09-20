"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasAtLeast } from "@/lib/auth/roles";

/** `null` = untouched. A success is its own value so forms can tell it apart and clear. */
export type MessageState = { error: string } | { ok: true } | null;

const MAX_SUBJECT = 200;
const MAX_BODY = 4000;

const field = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

async function requireSession() {
  const session = await getSession();
  if (!session?.profile) redirect("/login?next=/study/profile");
  return session;
}

/** Student opens a new thread, optionally citing one of their own attempts. */
export async function createThread(_prev: MessageState, fd: FormData): Promise<MessageState> {
  const { user } = await requireSession();
  const supabase = createClient();

  const subject = field(fd, "subject");
  const body = field(fd, "body");
  const sessionId = field(fd, "session_id");

  if (!subject) return { error: "Give your question a short subject." };
  if (subject.length > MAX_SUBJECT) return { error: `Keep the subject under ${MAX_SUBJECT} characters.` };
  if (!body) return { error: "Write your question before sending." };
  if (body.length > MAX_BODY) return { error: `Keep your message under ${MAX_BODY} characters.` };

  const { data: thread, error } = await supabase
    .from("message_threads")
    .insert({ student_id: user.id, subject, session_id: sessionId || null })
    .select("id")
    .single();
  // The DB rejects an attempt belonging to someone else (trg_validate_thread_session).
  if (error) return { error: `Could not start the conversation: ${error.message}` };

  const { error: msgError } = await supabase
    .from("messages")
    .insert({ thread_id: thread.id, author_id: user.id, body });
  if (msgError) {
    await supabase.from("message_threads").delete().eq("id", thread.id);
    return { error: `Could not send your message: ${msgError.message}` };
  }

  revalidatePath("/study/profile");
  redirect(`/study/profile/threads/${thread.id}`);
}

/** Staff open a conversation with a student. The roster is teacher-visible. */
export async function createThreadForStudent(
  _prev: MessageState,
  fd: FormData
): Promise<MessageState> {
  const { user, profile } = await requireSession();
  if (!hasAtLeast(profile.role, "teacher")) return { error: "Only teaching staff can do that." };
  const supabase = createClient();

  const studentId = field(fd, "student_id");
  const subject = field(fd, "subject");
  const body = field(fd, "body");

  if (!studentId) return { error: "Choose a student to write to." };
  if (!subject) return { error: "Give the message a short subject." };
  if (subject.length > MAX_SUBJECT) return { error: `Keep the subject under ${MAX_SUBJECT} characters.` };
  if (!body) return { error: "Write your message before sending." };
  if (body.length > MAX_BODY) return { error: `Keep your message under ${MAX_BODY} characters.` };

  const { data: thread, error } = await supabase
    .from("message_threads")
    .insert({ student_id: studentId, subject })
    .select("id")
    .single();
  // trg_validate_thread_session rejects a student_id that is really staff.
  if (error) return { error: `Could not start the conversation: ${error.message}` };

  const { error: msgError } = await supabase
    .from("messages")
    .insert({ thread_id: thread.id, author_id: user.id, body });
  if (msgError) {
    await supabase.from("message_threads").delete().eq("id", thread.id);
    return { error: `Could not send your message: ${msgError.message}` };
  }

  revalidatePath("/teacher/messages");
  redirect(`/teacher/messages/${thread.id}`);
}

/** Reply in an existing thread. Works for both sides; RLS decides who may post. */
export async function postReply(_prev: MessageState, fd: FormData): Promise<MessageState> {
  const { user, profile } = await requireSession();
  const supabase = createClient();

  const threadId = field(fd, "thread_id");
  const body = field(fd, "body");
  if (!body) return { error: "Write a message before sending." };
  if (body.length > MAX_BODY) return { error: `Keep your message under ${MAX_BODY} characters.` };

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, author_id: user.id, body });
  if (error) {
    return {
      error: error.code === "42501" || error.code === "23514"
        ? "This conversation is closed, or you don't have access to it."
        : `Could not send your message: ${error.message}`,
    };
  }

  const staff = hasAtLeast(profile.role, "teacher");
  const path = staff ? `/teacher/messages/${threadId}` : `/study/profile/threads/${threadId}`;
  revalidatePath(path);
  revalidatePath(staff ? "/teacher/messages" : "/study/profile");
  return { ok: true };
}

/** Stamp the caller's read marker. Safe to call on every thread view. */
export async function markThreadRead(threadId: string): Promise<void> {
  const session = await getSession();
  if (!session?.profile) return;
  await createClient().rpc("mark_thread_read", { p_thread_id: threadId });
}

/** Students maintain their own display name — this is what staff see in the inbox. */
export async function updateDisplayName(_prev: MessageState, fd: FormData): Promise<MessageState> {
  const { user } = await requireSession();
  const fullName = field(fd, "full_name");
  if (!fullName) return { error: "Your name can't be empty." };
  if (fullName.length > 120) return { error: "Keep your name under 120 characters." };

  // The role/tier guard trigger (T12) blocks anything privileged from changing here.
  const { error } = await createClient()
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) return { error: `Could not save your name: ${error.message}` };

  revalidatePath("/study/profile");
  return { ok: true };
}
