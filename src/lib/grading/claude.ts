import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GRADE_SCHEMA, GRADER_SYSTEM, graderUserPrompt, type Assignment, type Grade, type StudentQuestion } from "./rubric";

/** The paid-API pathway's model. Opus-tier judgement on clinical accuracy; roughly 3–5 US cents a question. */
export const GRADER_MODEL = "claude-opus-5-5";

export type ApiGradeResult = { ok: true; grade: Grade; model: string } | { ok: false; error: string };

/**
 * Grade one question with the Anthropic API. Needs ANTHROPIC_API_KEY on the server. Server-side fallbacks are on, so a
 * safety-classifier decline (possible with clinical content) is retried on a fallback model inside the same call.
 */
export async function gradeWithClaude(a: Assignment, q: StudentQuestion): Promise<ApiGradeResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not set on the server" };
  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
  try {
    const res = await client.beta.messages.parse({
      model: GRADER_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: zodOutputFormat(GRADE_SCHEMA) },
      system: [{ type: "text", text: GRADER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: graderUserPrompt(a, q) }],
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "The grader declined this question" };
    if (res.stop_reason === "max_tokens") return { ok: false, error: "The grader ran out of room" };
    if (!res.parsed_output) return { ok: false, error: "The grader's answer could not be read" };
    return { ok: true, grade: res.parsed_output, model: res.model };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Rate limited by the API" };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The API key was rejected" };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `API error ${e.status ?? ""}`.trim() };
    return { ok: false, error: e instanceof Error ? e.message : "Unknown grading error" };
  }
}
