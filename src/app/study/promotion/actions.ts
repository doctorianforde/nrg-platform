"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { flags } from "@/lib/flags";
import type { PromotionState } from "@/lib/xp/rank-v2";

/** Start (or resume) the promotion quiz. Eligibility, the retake wait and question choice are all decided in the database. */
export async function startPromotion() {
  if (!flags.rankingV2) notFound();
  await requireRole("student", "/study/promotion");
  const { data, error } = await createClient().rpc("start_promotion_quiz");
  if (error) redirect(`/study/promotion?error=${encodeURIComponent(error.message)}`);
  redirect(`/study/promotion/${data}`);
}

/** Answer the current question. The server checks it is the current one and still inside its 90 seconds. */
export async function answerPromotion(attemptId: string, position: number, optionIds: string[]): Promise<PromotionState | { error: string }> {
  if (!flags.rankingV2) return { error: "Not available." };
  await requireRole("student", `/study/promotion/${attemptId}`);
  const { data, error } = await createClient().rpc("promotion_answer", { p_attempt: attemptId, p_position: position, p_option_ids: optionIds });
  if (error) return { error: error.message };
  const state = data as unknown as PromotionState;
  if (state.done) revalidatePath("/study/profile");
  return state;
}

/** Re-read the current state, e.g. when the countdown reaches zero; the server scores a timed-out question and moves on. */
export async function refreshPromotion(attemptId: string): Promise<PromotionState | { error: string }> {
  if (!flags.rankingV2) return { error: "Not available." };
  await requireRole("student", `/study/promotion/${attemptId}`);
  const { data, error } = await createClient().rpc("promotion_current", { p_attempt: attemptId });
  if (error) return { error: error.message };
  const state = data as unknown as PromotionState;
  if (state.done) revalidatePath("/study/profile");
  return state;
}
