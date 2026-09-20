"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type GroupActionState = { error: string } | null;

/**
 * Every write here is a SECURITY DEFINER RPC, not a table write. Capacity, the
 * "one live group per paper" rule, the students-only rule and the start gate all
 * live in Postgres (20260920060000), so they hold however the call arrives —
 * these actions only translate the error into something a student can read.
 */

/** Postgres error codes the RPCs raise deliberately, mapped to plain English. */
function readable(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  const m = message.toLowerCase();
  if (m.includes("full")) return "That group is already full (5 students maximum).";
  if (m.includes("already started")) return "That exam has already started.";
  if (m.includes("already in a group")) return "You are already in a group for this exam.";
  if (m.includes("no group is waiting")) return "No group is waiting on that code. Check it and try again.";
  if (m.includes("only students")) return "Only students can sit a group exam.";
  if (m.includes("at least 2")) return "A group exam needs at least 2 students.";
  if (m.includes("only the group owner")) return "Only the person who created the group can start it.";
  if (m.includes("cannot leave")) return "The exam has started, so you cannot leave now.";
  return message;
}

export async function createGroup(
  _prev: GroupActionState,
  fd: FormData
): Promise<GroupActionState> {
  const setId = String(fd.get("set_id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  if (!setId) return { error: "Missing exam set." };
  await requireRole("student", "/study/mock-exams");

  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("create_exam_group", { p_set_id: setId, p_name: name || null })
    .single<{ id: string }>();
  if (error || !data) return { error: readable(error?.message, "Could not create the group.") };

  redirect(`/study/mock-exams/group/${data.id}`);
}

export async function joinGroup(
  _prev: GroupActionState,
  fd: FormData
): Promise<GroupActionState> {
  const code = String(fd.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    return { error: "A join code is 6 letters and numbers, like 7QK2MP." };
  }
  await requireRole("student", "/study/mock-exams");

  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("join_exam_group", { p_code: code })
    .single<{ id: string }>();
  if (error || !data) return { error: readable(error?.message, "Could not join that group.") };

  redirect(`/study/mock-exams/group/${data.id}`);
}

export async function startGroup(
  _prev: GroupActionState,
  fd: FormData
): Promise<GroupActionState> {
  const groupId = String(fd.get("group_id") ?? "");
  if (!groupId) return { error: "Missing group." };
  await requireRole("student", "/study/mock-exams");

  const supabase = createClient();
  const { error } = await supabase.rpc("start_exam_group", { p_group: groupId });
  if (error) return { error: readable(error.message, "Could not start the exam.") };

  // The lobby page turns into a redirect to each member's own session.
  revalidatePath(`/study/mock-exams/group/${groupId}`);
  return null;
}

export async function leaveGroup(
  _prev: GroupActionState,
  fd: FormData
): Promise<GroupActionState> {
  const groupId = String(fd.get("group_id") ?? "");
  if (!groupId) return { error: "Missing group." };
  await requireRole("student", "/study/mock-exams");

  const supabase = createClient();
  const { error } = await supabase.rpc("leave_exam_group", { p_group: groupId });
  if (error) return { error: readable(error.message, "Could not leave the group.") };

  redirect("/study/mock-exams");
}
