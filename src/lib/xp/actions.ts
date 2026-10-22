"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { startEvaluation } from "@/lib/grading/store";
import { TAXONOMY_TO_LEVEL, type Assignment, type StemLength, type Taxonomy } from "@/lib/grading/rubric";
import type { PracticeAnswer } from "@/components/questions/TutorSession";

export type SubmitState = { error: string } | { ok: string } | null;

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const OPTION_KEYS = ["a", "b", "c", "d"] as const;

/**
 * A student submits a question written to their assignment (Template 3: the platform picks topic, domain, taxonomy and
 * stem length; the student writes the stem, four options and an optional rationale).
 *
 * It is written as an inactive, pending, non-AI draft attributed to the author — the insert policy enforces exactly that,
 * so this cannot create live content. Then the AI grade starts (instant in api mode, queued in agent mode); the grade is
 * advice, and XP still follows only a teacher's approval.
 */
export async function submitQuestion(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const session = await getSession();
  if (!session?.profile) return { error: "Sign in to submit a question." };

  const body = field(fd, "body");
  const explanation = field(fd, "explanation");
  const correct = field(fd, "correct");
  const assignmentId = field(fd, "assignment_id");
  const options = OPTION_KEYS.map((k) => ({ key: k, body: field(fd, `option_${k}`) }));

  if (body.length < 20) return { error: "Write the question itself — at least a sentence." };
  if (body.length > 4000) return { error: "That question is too long." };
  if (options.some((o) => !o.body)) return { error: "Fill in all four answer options." };
  if (options.some((o) => o.body.length > 500)) return { error: "Keep each option under 500 characters." };
  if (!OPTION_KEYS.includes(correct as (typeof OPTION_KEYS)[number])) {
    return { error: "Mark which option is correct." };
  }
  if (explanation && explanation.length < 20) return { error: "If you add a rationale, give it at least a sentence." };
  if (explanation.length > 4000) return { error: "That rationale is too long." };

  const uniqueOptions = new Set(options.map((o) => o.body.toLowerCase()));
  if (uniqueOptions.size !== options.length) {
    return { error: "The four options need to be different from each other." };
  }

  // The assignment must be the student's own, still open.
  const { data: asg } = await adminClient.from("qgen_assignments")
    .select("id, method, domain_id, topic_id, topic, taxonomy, stem_length, used_at, user_id, domains(code, name)")
    .eq("id", assignmentId).maybeSingle();
  if (!asg || asg.user_id !== session.user.id || asg.used_at) {
    return { error: "That assignment has expired. Reload the page for your current one." };
  }

  const supabase = createClient();
  const { data: question, error } = await supabase
    .from("questions")
    .insert({
      body,
      explanation: explanation || null,
      domain_id: asg.domain_id,
      topic_id: asg.topic_id,
      cognitive_level: TAXONOMY_TO_LEVEL[asg.taxonomy as Taxonomy] ?? null,
      difficulty: null,
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
    // A question with no options is unreviewable — don't leave one behind. (Service role: no policy lets the student delete.)
    await adminClient.from("questions").delete().eq("id", question.id);
    return { error: `Could not save the answer options: ${optionError.message}` };
  }

  await adminClient.from("qgen_assignments").update({ question_id: question.id, used_at: new Date().toISOString() }).eq("id", asg.id);
  const d = Array.isArray(asg.domains) ? asg.domains[0] : asg.domains;
  const outcome = await startEvaluation({
    questionId: question.id,
    userId: session.user.id,
    assignment: {
      method: asg.method as Assignment["method"], topic: asg.topic, domainCode: d?.code ?? "", domainName: d?.name ?? "",
      taxonomy: asg.taxonomy as Taxonomy, stemLength: asg.stem_length as StemLength,
    },
    question: {
      stem: body,
      options: options.map((o) => ({ letter: o.key.toUpperCase() as "A" | "B" | "C" | "D", text: o.body })),
      correct: correct.toUpperCase() as "A" | "B" | "C" | "D",
      rationale: explanation || null,
    },
  });

  revalidatePath("/study/submit");
  revalidatePath("/study/profile");
  if (outcome.kind === "graded") {
    return {
      ok: outcome.passed
        ? `Graded ${outcome.overall}/100 — a pass. Your feedback is below; a teacher reviews it next, and you earn XP once it's approved.`
        : `Graded ${outcome.overall}/100 — not a pass yet. Your feedback is below; use it on your next question.`,
    };
  }
  if (outcome.kind === "queued") {
    return { ok: `Submitted. Your AI feedback appears below once grading runs.${outcome.note ? ` ${outcome.note}` : ""} A teacher reviews it too.` };
  }
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

/**
 * Ranking v2: record a finished practice run as the questions shown and the options chosen. The server grades each
 * answer against the key, stores it in question_attempts and decides the XP, so nothing the browser reports about
 * correctness is trusted. Only called when the ranking-v2 flag is on (the database function exists on staging only).
 */
export async function recordPracticeAnswers(answers: PracticeAnswer[], domainId?: number | null): Promise<void> {
  const session = await getSession();
  if (!session?.profile || answers.length === 0) return;

  const { error } = await createClient().rpc("record_practice_answers", {
    p_answers: answers.map((a) => ({ question_id: a.question_id, option_ids: a.option_ids })),
    p_domain: domainId ?? undefined,
  });
  if (error) console.error("record_practice_answers failed:", error.message);
  revalidatePath("/study/profile");
}
