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
  const rawDuration = String(fd.get("duration_minutes") ?? "").trim();
  if (!title) return { error: "Give the exam set a title." };
  if (title.length > 200) return { error: "Title is too long (max 200 characters)." };

  // Blank means untimed. The DB also enforces the 5-600 range.
  let duration: number | null = null;
  if (rawDuration) {
    const n = Number(rawDuration);
    if (!Number.isInteger(n) || n < 5 || n > 600) {
      return { error: "A time limit must be a whole number of minutes between 5 and 600." };
    }
    duration = n;
  }

  const supabase = createClient();
  const { data: set, error } = await supabase
    .from("mock_exam_sets")
    .insert({ title, description: description || null, created_by: user.id, duration_minutes: duration })
    .select("id")
    .single();
  if (error || !set) {
    return { error: `Could not create the exam set${error ? `: ${error.message}` : "."}` };
  }
  redirect(`/teacher/mock-exams/${set.id}`);
}
