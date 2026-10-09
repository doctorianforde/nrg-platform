import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";

/** Case studies are a paid feature (Ian, 2026-10-08): standard/premium students; staff always. */
export function canTakeCases(profile: Profile): boolean {
  return hasAtLeast(profile.role, "teacher") || profile.subscription_tier === "standard" || profile.subscription_tier === "premium";
}

export const CJ_LABEL: Record<string, string> = {
  recognize_cues: "Recognize cues",
  analyze_cues: "Analyze cues",
  prioritize_hypotheses: "Prioritize hypotheses",
  generate_solutions: "Generate solutions",
  take_action: "Take action",
  evaluate_outcomes: "Evaluate outcomes",
  extension: "Extension",
};

export const TAXONOMY_LABEL: Record<string, string> = { KC: "Knowledge/Comprehension", AP: "Application", ASE: "Analysis/Synthesis/Evaluation" };

/** Rationale-view classes (V3 s.11): colour plus a text label, never colour alone. Correct is listed first. */
export const OPTION_TYPE: Record<string, { label: string; className: string; order: number }> = {
  correct: { label: "Correct", className: "border-green-500 bg-green-50 text-green-900", order: 0 },
  close: { label: "Close", className: "border-yellow-400 bg-yellow-50 text-yellow-900", order: 1 },
  priority: { label: "Priority / sequencing", className: "border-orange-400 bg-orange-50 text-orange-900", order: 2 },
  incorrect: { label: "Incorrect", className: "border-red-400 bg-red-50 text-red-900", order: 3 },
  unsafe: { label: "Unsafe", className: "border-red-600 bg-red-100 text-red-950", order: 4 },
  not_asked: { label: "Correct statement, not what was asked", className: "border-slate-400 bg-slate-50 text-slate-900", order: 5 },
};

export type Vital = { label: string; value: string };
export type Finding = { system: string; finding: string };
export type LabGroup = { category: string; items: { label: string; value: string; reference?: string }[] };
export type Stage = { id: string; stage_order: number; time_label: string; narrative: string; vitals: Vital[]; assessment: Finding[]; labs: LabGroup[] };

export type CaseHeader = {
  id: string; case_code: string | null; title: string; objective: string | null; population: string | null; setting: string | null;
  primary_condition: string | null; endpoint: string | null; difficulty: string | null; status: string; is_active: boolean;
  pathophysiology: string | null; quality_report: string | null; validation_status: string; validated_at: string | null;
  validation_note: string | null; source: string | null; domain: { code: string; name: string } | null;
};

export type CaseOption = { id: string; body: string; display_order: number; is_correct?: boolean; rationale?: string | null; distractor_type?: string | null };
export type CaseQuestion = {
  id: string; position: number; stageOrder: number; cj_step: string; meta: Record<string, string | null>;
  body: string; explanation?: string | null; options: CaseOption[];
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function getCaseHeader(id: string): Promise<CaseHeader | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("case_studies")
    .select("id, case_code, title, objective, population, setting, primary_condition, endpoint, difficulty, status, is_active, pathophysiology, quality_report, validation_status, validated_at, validation_note, source, domains(code, name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { domains, ...rest } = data as typeof data & { domains: { code: string; name: string } | { code: string; name: string }[] | null };
  return { ...(rest as Omit<CaseHeader, "domain">), domain: one(domains) };
}

export async function getStages(caseId: string): Promise<Stage[]> {
  const supabase = createClient();
  const { data } = await supabase.from("case_stages").select("*").eq("case_study_id", caseId).order("stage_order");
  return (data ?? []).map((s) => ({ ...s, vitals: (s.vitals ?? []) as Vital[], assessment: (s.assessment ?? []) as Finding[], labs: (s.labs ?? []) as LabGroup[] }));
}

/**
 * Case questions in order. With `withAnswers: false` the key, rationales and option types are stripped
 * on the server, so nothing that could cue the answer reaches the browser before the case is complete.
 */
export async function getCaseQuestions(caseId: string, { withAnswers }: { withAnswers: boolean }): Promise<CaseQuestion[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("case_study_questions")
    .select("display_order, cj_step, meta, case_stages(stage_order), questions(id, body, explanation, question_options(id, body, display_order, is_correct, rationale, distractor_type))")
    .eq("case_study_id", caseId)
    .order("display_order");
  type Row = {
    display_order: number; cj_step: string | null; meta: Record<string, string | null> | null;
    case_stages: { stage_order: number } | { stage_order: number }[] | null;
    questions: { id: string; body: string; explanation: string | null; question_options: Required<CaseOption>[] } | null;
  };
  return ((data ?? []) as unknown as Row[]).filter((r) => r.questions).map((r) => {
    const q = r.questions!;
    const options = [...q.question_options].sort((a, b) => a.display_order - b.display_order)
      .map((o) => (withAnswers ? o : { id: o.id, body: o.body, display_order: o.display_order }));
    return {
      id: q.id, position: r.display_order, stageOrder: one(r.case_stages)?.stage_order ?? 0, cj_step: r.cj_step ?? "extension",
      meta: (withAnswers ? r.meta : {}) ?? {}, body: q.body, explanation: withAnswers ? q.explanation : undefined, options,
    };
  });
}
