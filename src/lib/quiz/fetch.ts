import { createClient } from "@/lib/supabase/server";
import { loadAnswerKeys } from "./answer-keys";
import type { QuizQuestion } from "./types";

export type QuizFilters = {
  domainId?: number | null;
  topicId?: number | null;
  cognitive?: string | null;
  difficulty?: string | null;
  limit?: number;
  /** When set, fetch exactly these question ids (e.g. a mock exam set's questions). */
  ids?: string[];
  /** Keep the given/DB order instead of shuffling (mock exams, case studies). */
  preserveOrder?: boolean;
};

// No answer key here: is_correct, rationale and explanation are not readable with a student's token at all
// (migration 20261012170000). Keys are attached server-side by attachKeys() only where a page has decided they may be shown.
const QUESTION_SELECT =
  "id, body, cognitive_level, difficulty, question_type, domains(name), topics(name), question_options(id, body, display_order)";

type Row = {
  id: string;
  body: string;
  cognitive_level: string | null;
  difficulty: string | null;
  question_type: string;
  domains: { name: string } | { name: string }[] | null;
  topics: { name: string } | { name: string }[] | null;
  question_options: Array<{
    id: string;
    body: string;
    display_order: number;
  }>;
};

function toQuizQuestion(r: Row): QuizQuestion {
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    id: r.id,
    body: r.body,
    cognitive_level: r.cognitive_level,
    difficulty: r.difficulty,
    question_type: r.question_type,
    domainName: one(r.domains)?.name ?? null,
    topicName: one(r.topics)?.name ?? null,
    options: [...r.question_options].sort((a, b) => a.display_order - b.display_order),
  };
}

/**
 * Student-facing questions. RLS allows reading all rows, so the is_active
 * filter is applied here at the app layer (per T12 policy note) — students
 * must never receive inactive/unapproved questions.
 */
export async function fetchQuizQuestions(filters: QuizFilters): Promise<QuizQuestion[]> {
  const supabase = createClient();
  let query = supabase
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("is_active", true)
    .order("id");

  if (filters.ids) query = query.in("id", filters.ids);
  // Case questions only make sense inside their case, so random pools never draw them.
  else query = query.eq("context", "standalone");
  if (filters.domainId) query = query.eq("domain_id", filters.domainId);
  if (filters.topicId) query = query.eq("topic_id", filters.topicId);
  if (filters.cognitive) query = query.eq("cognitive_level", filters.cognitive);
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
  if (filters.ids && filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load questions: ${error.message}`);

  let rows = (data ?? []) as Row[];
  if (!filters.preserveOrder) {
    // Randomise, then cap — the DB returns deterministic order.
    rows = rows.sort(() => Math.random() - 0.5);
  }
  if (filters.ids && filters.ids.length > 0) {
    // Return in the caller's id order (e.g. mock exam display_order).
    const byId = new Map(rows.map((r) => [r.id, r]));
    rows = filters.ids.map((id) => byId.get(id)).filter((r): r is Row => Boolean(r));
  } else if (filters.limit) {
    rows = rows.slice(0, filters.limit);
  }
  return rows.map(toQuizQuestion);
}

/**
 * Add the answer key (and, if `rationales`, the explanation, per-option rationales and option types) to questions
 * already loaded.
 * SERVER-ONLY: reads with the service role, so the caller must first have decided the viewer may see them (staff, or a
 * finished attempt). Never call this for a question the student is still answering.
 */
export async function attachKeys(questions: QuizQuestion[], { rationales }: { rationales: boolean }): Promise<QuizQuestion[]> {
  if (questions.length === 0) return questions;
  const keys = await loadAnswerKeys(questions.map((q) => q.id));
  const byId = new Map(keys.map((r) => [r.id, r]));
  return questions.map((q) => {
    const k = byId.get(q.id);
    const opt = new Map((k?.question_options ?? []).map((o) => [o.id, o]));
    return {
      ...q,
      explanation: rationales ? k?.explanation ?? null : null,
      options: q.options.map((o) => ({
        ...o,
        is_correct: opt.get(o.id)?.is_correct ?? false,
        rationale: rationales ? opt.get(o.id)?.rationale ?? null : null,
        distractor_type: rationales ? opt.get(o.id)?.distractor_type ?? null : null,
      })),
    };
  });
}
