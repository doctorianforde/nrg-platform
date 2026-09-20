"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { COGNITIVE_LEVELS, DIFFICULTIES } from "@/lib/review/filters";

export type SubmitState = { error: string } | { ok: string } | null;

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPTION_KEYS = ["a", "b", "c", "d"] as const;

/**
 * A student submits a question for review.
 *
 * It is written as an inactive, pending, non-AI draft attributed to the author —
 * the insert policy enforces exactly that, so this cannot create live content. XP
 * follows later, from the approval trigger, never from here.
 */
export async function submitQuestion(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const session = await getSession();
  if (!session?.profile) return { error: "Sign in to submit a question." };

  const body = field(fd, "body");
  const explanation = field(fd, "explanation");
  const domainId = Number(field(fd, "domain_id"));
  const cognitive = field(fd, "cognitive_level");
  const difficulty = field(fd, "difficulty");
  const correct = field(fd, "correct");
  const options = OPTION_KEYS.map((k) => ({ key: k, body: field(fd, `option_${k}`) }));

  if (body.length < 20) return { error: "Write the question itself — at least a sentence." };
  if (body.length > 4000) return { error: "That question is too long." };
  if (!Number.isInteger(domainId) || domainId <= 0) return { error: "Choose a domain." };
  if (options.some((o) => !o.body)) return { error: "Fill in all four answer options." };
  if (options.some((o) => o.body.length > 500)) return { error: "Keep each option under 500 characters." };
  if (!OPTION_KEYS.includes(correct as (typeof OPTION_KEYS)[number])) {
    return { error: "Mark which option is correct." };
  }
  if (explanation.length < 20) {
    return { error: "Explain why the correct answer is right — that's the part that gets approved." };
  }
  if (explanation.length > 4000) return { error: "That explanation is too long." };
  if (cognitive && !(COGNITIVE_LEVELS as readonly string[]).includes(cognitive)) {
    return { error: "Invalid cognitive level." };
  }
  if (difficulty && !(DIFFICULTIES as readonly string[]).includes(difficulty)) {
    return { error: "Invalid difficulty." };
  }

  const uniqueOptions = new Set(options.map((o) => o.body.toLowerCase()));
  if (uniqueOptions.size !== options.length) {
    return { error: "The four options need to be different from each other." };
  }

  const supabase = createClient();
  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      body,
      explanation,
      domain_id: domainId,
      cognitive_level: cognitive || null,
      difficulty: difficulty || null,
      question_type: "mcq",
      source: "student-submission",
      is_ai_generated: false,
      is_active: false,
      review_status: "pending",
      created_by: session.user.id,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not submit that question: ${error.message}` };

  const { error: optionError } = await supabase.from("question_options").insert(
    options.map((o, i) => ({
      question_id: question.id,
      body: o.body,
      is_correct: o.key === correct,
      display_order: i + 1,
    }))
  );
  if (optionError) {
    // A question with no options is unreviewable — don't leave one behind.
    await supabase.from("questions").delete().eq("id", question.id);
    return { error: `Could not save the answer options: ${optionError.message}` };
  }

  revalidatePath("/study/submit");
  revalidatePath("/study/profile");
  return { ok: "Submitted. You'll earn XP once a teacher approves it." };
}

/**
 * Record a finished practice run and award its XP.
 *
 * The client reports how many it answered and got right; the server decides the XP
 * and attributes the session to the caller, so the tally can inflate a count but
 * never the reward beyond the per-session cap.
 */
export async function recordPracticeSession(
  total: number,
  correct: number,
  domainId?: number | null
): Promise<void> {
  const session = await getSession();
  if (!session?.profile) return;

  await createClient().rpc("record_practice_session", {
    p_total: Math.round(total),
    p_correct: Math.round(correct),
    p_domain: domainId ?? undefined,
  });
  revalidatePath("/study/profile");
}
