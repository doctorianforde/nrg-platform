"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type SessionActionState = { error: string } | null;

type OwnedSession = {
  id: string;
  student_id: string;
  completed_at: string | null;
  set_id: string;
};

/** Load the session and verify it belongs to the current student and is still open. */
async function getOpenOwnSession(sessionId: string): Promise<OwnedSession | { error: string }> {
  const { user } = await requireRole("student", `/study/mock-exams/session/${sessionId}`);
  const supabase = createClient();
  const { data: session } = await supabase
    .from("mock_exam_sessions")
    .select("id, student_id, completed_at, set_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.student_id !== user.id) return { error: "Exam session not found." };
  if (session.completed_at) return { error: "This exam has already been submitted." };
  return session;
}

/**
 * Continuously save one answer. Grading (is_correct) is done by the DB trigger;
 * the app never sets it. RLS also restricts writes to the owner's open session.
 */
export async function saveResponse(
  sessionId: string,
  questionId: string,
  selectedOptionIds: string[]
): Promise<SessionActionState> {
  const session = await getOpenOwnSession(sessionId);
  if ("error" in session) return { error: session.error };
  const supabase = createClient();

  const { data: membership } = await supabase
    .from("mock_exam_set_questions")
    .select("question_id")
    .eq("set_id", session.set_id)
    .eq("question_id", questionId)
    .maybeSingle();
  if (!membership) return { error: "That question is not part of this exam." };

  if (selectedOptionIds.length > 0) {
    const { data: options } = await supabase
      .from("question_options")
      .select("id")
      .eq("question_id", questionId);
    const valid = new Set((options ?? []).map((o) => o.id));
    if (!selectedOptionIds.every((id) => valid.has(id))) {
      return { error: "Invalid answer selection." };
    }
  }

  const { error } = await supabase.from("mock_exam_responses").upsert(
    {
      session_id: sessionId,
      question_id: questionId,
      selected_option_ids: selectedOptionIds,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "session_id,question_id" }
  );
  if (error) return { error: `Could not save your answer: ${error.message}` };
  return null;
}

/** Finalise the attempt. The RPC grades the session and errors for non-owners. */
export async function submitSession(
  sessionId: string
): Promise<SessionActionState> {
  const session = await getOpenOwnSession(sessionId);
  if ("error" in session) return { error: session.error };
  const supabase = createClient();

  const { error } = await supabase.rpc("complete_mock_exam_session", {
    p_session_id: sessionId,
  });
  if (error) return { error: `Could not submit the exam: ${error.message}` };

  revalidatePath(`/study/mock-exams/session/${sessionId}`);
  redirect(`/study/mock-exams/session/${sessionId}`);
}
