"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Start (or resume) an attempt. Tier and availability are enforced by the start_case_attempt function. */
export async function startCase(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  await requireRole("student", `/study/case-studies/${caseId}`);
  const { error } = await createClient().rpc("start_case_attempt", { p_case_id: caseId });
  if (error) redirect(`/study/case-studies/${caseId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/study/case-studies/${caseId}`);
  redirect(`/study/case-studies/${caseId}`);
}

/** Lock in the answer to the current question. Order, ownership and grading are enforced in the database. */
export async function answerCase(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const attemptId = String(formData.get("attemptId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");
  await requireRole("student", `/study/case-studies/${caseId}`);
  if (!optionId) redirect(`/study/case-studies/${caseId}?error=${encodeURIComponent("Choose an answer before continuing.")}`);
  const { error } = await createClient().rpc("answer_case_question", { p_attempt_id: attemptId, p_option_id: optionId });
  if (error) redirect(`/study/case-studies/${caseId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/study/case-studies/${caseId}`);
  redirect(`/study/case-studies/${caseId}`);
}
