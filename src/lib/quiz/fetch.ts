import { createClient } from "@/lib/supabase/server";
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

const QUESTION_SELECT =
  "id, body, cognitive_level, difficulty, question_type, explanation, domains(name), topics(name), question_options(id, body, is_correct, rationale, display_order)";

type Row = {
  id: string;
  body: string;
  cognitive_level: string | null;
  difficulty: string | null;
  question_type: string;
  explanation: string | null;
  domains: { name: string } | { name: string }[] | null;
  topics: { name: string } | { name: string }[] | null;
  question_options: Array<{
    id: string;
    body: string;
    is_correct: boolean;
    rationale: string | null;
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
    explanation: r.explanation,
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
