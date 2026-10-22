import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { gradeWithClaude } from "./claude";
import { evaluationRecord, type Assignment, type StudentQuestion } from "./rubric";

export type QgenConfig = {
  gradingMode: "off" | "agent" | "api";
  passMark: number;
  dailyRule: boolean;
  leaderboard: "off" | "staff" | "students";
};

/** qgen_config (20261022180000). Everything off on a database without it. */
export async function qgenConfig(): Promise<QgenConfig> {
  const { data } = await adminClient.from("qgen_config").select("key, value");
  const v = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const mode = v.grading_mode === "api" || v.grading_mode === "agent" ? v.grading_mode : "off";
  const board = v.leaderboard === "staff" || v.leaderboard === "students" ? v.leaderboard : "off";
  return { gradingMode: mode, passMark: Number(v.pass_mark) || 75, dailyRule: v.daily_rule === "on", leaderboard: board };
}

export type EvaluationOutcome =
  | { kind: "off" }
  | { kind: "graded"; overall: number; passed: boolean }
  | { kind: "queued"; note?: string };

/**
 * Record an evaluation for a just-submitted question and, in api mode, grade it now. If the API can't be used (no key,
 * an outage, a decline) the evaluation falls back to the agent queue, so no question goes ungraded.
 */
export async function startEvaluation(input: {
  questionId: string;
  userId: string;
  assignment: Assignment;
  question: StudentQuestion;
}): Promise<EvaluationOutcome> {
  const cfg = await qgenConfig();
  if (cfg.gradingMode === "off") return { kind: "off" };
  const { data: ev, error } = await adminClient.from("question_evaluations").insert({
    question_id: input.questionId, user_id: input.userId, pathway: cfg.gradingMode,
    assignment: { ...input.assignment, question: input.question },
    status: cfg.gradingMode === "api" ? "running" : "queued",
    started_at: cfg.gradingMode === "api" ? new Date().toISOString() : null,
  }).select("id").single();
  if (error || !ev) return { kind: "queued", note: "Grading could not be scheduled; a teacher will still review it." };
  if (cfg.gradingMode !== "api") return { kind: "queued" };

  const r = await gradeWithClaude(input.assignment, input.question);
  if (!r.ok) {
    await adminClient.from("question_evaluations")
      .update({ status: "queued", pathway: "agent", started_at: null, error: `API grading failed, queued instead: ${r.error}` })
      .eq("id", ev.id);
    return { kind: "queued", note: "Instant grading is unavailable right now, so it joins the grading queue." };
  }
  const rec = evaluationRecord(r.grade, cfg.passMark, r.model);
  await adminClient.from("question_evaluations").update(rec).eq("id", ev.id);
  return { kind: "graded", overall: rec.overall, passed: rec.passed };
}
