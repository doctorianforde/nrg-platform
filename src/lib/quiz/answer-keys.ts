import { adminClient } from "@/lib/supabase/admin";

export type KeyOption = { id: string; is_correct: boolean; rationale: string | null; distractor_type: string | null };
export type KeyRow = {
  id: string;
  is_active: boolean;
  context: string;
  explanation: string | null;
  question_options: KeyOption[];
};

const BASE = "id, is_active, context, explanation, question_options(id, is_correct, rationale";

// Prod has no question_options.distractor_type until migration 20261004181457. Asking for it there fails the whole
// select, so on that error the keys are re-read without it (types come back null and the review shows options
// neutrally). The miss is remembered for a while so prod does not pay for two round trips on every request.
const RETRY_TYPES_AFTER_MS = 10 * 60 * 1000;
let typesMissingUntil = 0;

const isMissingTypeColumn = (e: { code?: string; message?: string }) =>
  e.code === "42703" || /distractor_type/.test(e.message ?? "");

/**
 * Answer keys, rationales, explanations and option types for the given questions, read with the service role.
 * SERVER-ONLY: callers must first have decided the viewer may see them (after answering in tutor mode, a finished and
 * released mock, staff). Throws on a database error.
 */
export async function loadAnswerKeys(questionIds: string[]): Promise<KeyRow[]> {
  if (questionIds.length === 0) return [];
  const read = (withTypes: boolean) =>
    adminClient
      .from("questions")
      .select(`${BASE}${withTypes ? ", distractor_type" : ""})`)
      .in("id", questionIds);

  if (Date.now() >= typesMissingUntil) {
    const { data, error } = await read(true);
    if (!error) return (data ?? []) as unknown as KeyRow[];
    if (!isMissingTypeColumn(error)) throw new Error(`Failed to load answer keys: ${error.message}`);
    typesMissingUntil = Date.now() + RETRY_TYPES_AFTER_MS;
  }
  const { data, error } = await read(false);
  if (error) throw new Error(`Failed to load answer keys: ${error.message}`);
  return ((data ?? []) as unknown as KeyRow[]).map((q) => ({
    ...q,
    question_options: q.question_options.map((o) => ({ ...o, distractor_type: null })),
  }));
}
