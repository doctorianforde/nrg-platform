"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canManageSet } from "@/lib/mock-exam/utils";
import type { Tables } from "@/lib/supabase/types";

export type ManageSetState = { error: string } | null;

type SetRow = Tables<"mock_exam_sets">;

async function getManagedSet(setId: string): Promise<{ supabase: ReturnType<typeof createClient>; set: SetRow } | { error: string }> {
  const { profile } = await requireRole("teacher", `/teacher/mock-exams/${setId}`);
  const supabase = createClient();
  const { data: set } = await supabase
    .from("mock_exam_sets")
    .select("*")
    .eq("id", setId)
    .maybeSingle();
  if (!set) return { error: "Exam set not found." };
  if (!canManageSet(profile, set)) return { error: "You don't have access to this exam set." };
  return { supabase, set };
}

/**
 * Deliberately release rationales for the whole set. One-way for teachers:
 * only an admin can re-lock (enforced by DB trigger), so there is no
 * un-release path here. The trigger stamps rationale_released_by.
 */
export async function releaseRationales(
  _prev: ManageSetState,
  fd: FormData
): Promise<ManageSetState> {
  const setId = String(fd.get("set_id") ?? "");
  if (!setId) return { error: "Missing exam set." };
  const result = await getManagedSet(setId);
  if ("error" in result) return { error: result.error };
  const { supabase } = result;

  const { error } = await supabase
    .from("mock_exam_sets")
    .update({ rationale_released_at: new Date().toISOString() })
    .eq("id", setId);
  if (error) return { error: `Could not release rationales: ${error.message}` };

  revalidatePath(`/teacher/mock-exams/${setId}`);
  return null;
}

/** Remove a question from the set. display_order gaps are harmless. */
export async function removeQuestion(fd: FormData): Promise<void> {
  const setId = String(fd.get("set_id") ?? "");
  const questionId = String(fd.get("question_id") ?? "");
  if (!setId || !questionId) return;
  const result = await getManagedSet(setId);
  if ("error" in result) return;
  const { supabase } = result;

  await supabase
    .from("mock_exam_set_questions")
    .delete()
    .eq("set_id", setId)
    .eq("question_id", questionId);
  revalidatePath(`/teacher/mock-exams/${setId}`);
}

/** Append an active question to the end of the set. */
export async function addQuestion(
  setId: string,
  questionId: string
): Promise<ManageSetState> {
  if (!setId || !questionId) return { error: "Missing question." };
  const result = await getManagedSet(setId);
  if ("error" in result) return { error: result.error };
  const { supabase } = result;

  const { data: question } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .eq("is_active", true)
    .maybeSingle();
  if (!question) return { error: "That question is not available (inactive or removed)." };

  const { data: existing } = await supabase
    .from("mock_exam_set_questions")
    .select("display_order")
    .eq("set_id", setId);

  const { data: dup } = await supabase
    .from("mock_exam_set_questions")
    .select("question_id")
    .eq("set_id", setId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (dup) return { error: "That question is already in this set." };

  const nextOrder = Math.max(0, ...(existing ?? []).map((r) => r.display_order)) + 1;
  const { error } = await supabase
    .from("mock_exam_set_questions")
    .insert({ set_id: setId, question_id: questionId, display_order: nextOrder });
  if (error) return { error: `Could not add the question: ${error.message}` };

  revalidatePath(`/teacher/mock-exams/${setId}`);
  return null;
}
