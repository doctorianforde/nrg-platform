"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type CreateSetState = { error: string } | null;

export async function createSet(
  _prev: CreateSetState,
  fd: FormData
): Promise<CreateSetState> {
  const { user } = await requireRole("teacher", "/teacher/mock-exams");
  const title = String(fd.get("title") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  if (!title) return { error: "Give the exam set a title." };
  if (title.length > 200) return { error: "Title is too long (max 200 characters)." };

  const supabase = createClient();
  const { data: set, error } = await supabase
    .from("mock_exam_sets")
    .insert({ title, description: description || null, created_by: user.id })
    .select("id")
    .single();
  if (error || !set) {
    return { error: `Could not create the exam set${error ? `: ${error.message}` : "."}` };
  }
  redirect(`/teacher/mock-exams/${set.id}`);
}
