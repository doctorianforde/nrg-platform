"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type MockExamActionState = { error: string } | null;

/**
 * Start a new attempt, or resume the student's still-open attempt for the set
 * (never two open sessions for the same set + student).
 */
export async function startSession(
  _prev: MockExamActionState,
  fd: FormData
): Promise<MockExamActionState> {
  const setId = String(fd.get("set_id") ?? "");
  const { user } = await requireRole("student", "/study/mock-exams");
  if (!setId) return { error: "Missing exam set." };
  const supabase = createClient();

  const { data: set } = await supabase
    .from("mock_exam_sets")
    .select("id")
    .eq("id", setId)
    .eq("is_active", true)
    .maybeSingle();
  if (!set) return { error: "This exam is not available." };

  const { data: open } = await supabase
    .from("mock_exam_sessions")
    .select("id")
    .eq("student_id", user.id)
    .eq("set_id", setId)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) redirect(`/study/mock-exams/session/${open.id}`);

  const { data: session, error } = await supabase
    .from("mock_exam_sessions")
    .insert({ student_id: user.id, set_id: setId })
    .select("id")
    .single();
  if (error || !session) {
    return { error: `Could not start the exam${error ? `: ${error.message}` : "."}` };
  }
  redirect(`/study/mock-exams/session/${session.id}`);
}
