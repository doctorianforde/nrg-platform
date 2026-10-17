"use server";

import { getSession } from "@/lib/auth/session";
import { adminClient } from "@/lib/supabase/admin";
import { loadAnswerKeys, type KeyRow } from "@/lib/quiz/answer-keys";

export type RevealedAnswer = {
  correctIds: string[];
  rationales: Record<string, string | null>;
  /** Option id → distractor_type (null when the option is untyped, or on a database without the column). */
  types: Record<string, string | null>;
  explanation: string | null;
};

/**
 * Tutor mode: the key, explanation, option rationales and option types for ONE practice question, fetched only after the student has
 * answered it. Answer keys are not readable with a student's token, so this is the only way a student sees one.
 *
 * Refused for anything that isn't a live standalone practice question, and for a question that is part of the
 * student's open promotion quiz or an open mock exam sitting, so neither can be looked up mid-attempt.
 */
export async function revealPracticeAnswer(questionId: string): Promise<RevealedAnswer | { error: string }> {
  const session = await getSession();
  if (!session?.profile) return { error: "Sign in first." };
  const uid = session.user.id;

  let q: KeyRow | undefined;
  try {
    [q] = await loadAnswerKeys([questionId]);
  } catch {
    return { error: "Could not load the answer. Try again." };
  }
  if (!q || !q.is_active || q.context !== "standalone") return { error: "That question is not available." };

  const [{ data: openQuiz }, { data: openMocks }] = await Promise.all([
    adminClient.from("promotion_attempts").select("id").eq("user_id", uid).is("finished_at", null),
    adminClient.from("mock_exam_sessions").select("set_id").eq("student_id", uid).is("completed_at", null),
  ]);
  const quizIds = (openQuiz ?? []).map((a) => a.id);
  const setIds = (openMocks ?? []).map((s) => s.set_id);
  const [{ count: inQuiz }, { count: inMock }] = await Promise.all([
    quizIds.length
      ? adminClient.from("promotion_questions").select("question_id", { count: "exact", head: true }).in("attempt_id", quizIds).eq("question_id", questionId)
      : Promise.resolve({ count: 0 }),
    setIds.length
      ? adminClient.from("mock_exam_set_questions").select("question_id", { count: "exact", head: true }).in("set_id", setIds).eq("question_id", questionId)
      : Promise.resolve({ count: 0 }),
  ]);
  if ((inQuiz ?? 0) > 0 || (inMock ?? 0) > 0) return { error: "That question is part of an exam you are sitting." };

  return {
    correctIds: q.question_options.filter((o) => o.is_correct).map((o) => o.id),
    rationales: Object.fromEntries(q.question_options.map((o) => [o.id, o.rationale])),
    types: Object.fromEntries(q.question_options.map((o) => [o.id, o.distractor_type])),
    explanation: q.explanation,
  };
}
