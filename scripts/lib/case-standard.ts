/**
 * Case study format + validator (Jade's V3 case standard, CASE_REQUEST error-prevention addendum,
 * Ian's 2026-10-08 decisions). Shared by scripts/import-case.ts and the case generator.
 *
 * Mechanical rules only. Judgement checks (cover test, two-answer test, cue sufficiency, hidden
 * assumptions) belong to the reviewer pass and Jade's validation, recorded in quality_report.
 */
import { forbiddenPatterns, loadRules, type Rules } from "./mcq-standard";

export const CJ_STEPS = ["recognize_cues", "analyze_cues", "prioritize_hypotheses", "generate_solutions", "take_action", "evaluate_outcomes"] as const;
export type CjStep = (typeof CJ_STEPS)[number] | "extension";
export const CASE_OPTION_TYPES = ["correct", "close", "priority", "incorrect", "unsafe"] as const;
export const DOMAIN_CODES = ["NP", "CDM", "NLM", "PC", "HPMW", "COM", "PD"] as const;
export const TAXONOMIES = { KC: "knowledge", AP: "application", ASE: "analysis" } as const;

export type CaseStage = {
  key: string;                       // referenced by questions, e.g. "s1"
  time_label: string;                // "9:30 am", "Day 2, 9:00 am"
  narrative: string;                 // the NEW INFORMATION text (baseline: the opening scenario)
  vitals?: { label: string; value: string }[];
  assessment?: { system: string; finding: string }[];
  labs?: { category: string; items: { label: string; value: string }[] }[];
};
export type CaseQuestion = {
  position: number;                  // 1..8
  stage: string;                     // key of the last stage revealed before this question
  cj_step: CjStep;
  domain: (typeof DOMAIN_CODES)[number];
  taxonomy: keyof typeof TAXONOMIES;
  stem: string;
  options: { label: string; text: string }[];
  correct: string[];
  option_types: Record<string, string>;
  format?: "negative";
  rationale_correct: string;
  distractor_rationales: Record<string, string>;
  self_test: string;                 // addendum #5: why the best distractor is wrong, without "obviously"/"clearly"
  meta: { topic: string; subtopic: string; priority_principle?: string; prerequisites?: string; suggested_review?: string; secondary_domain?: string };
};
export type CaseDoc = {
  case_code: string;
  title: string;
  objective: string;
  population: string;
  setting: string;
  primary_condition: string;
  endpoint: string;
  primary_domain: (typeof DOMAIN_CODES)[number];
  difficulty: "low" | "moderate" | "high";
  source: string;                    // "jade", "jade+claude", "ai:<model>"
  opening: { time_label: string; narrative: string };
  stages: CaseStage[];               // in order; stage 0 is shown with the opening
  questions: CaseQuestion[];
  pathophysiology: string;           // markdown
  quality_report?: string;
  validation?: { status: "pending" | "validated"; by?: string; date?: string; note?: string };
};

const LEN = { maxRatio: 2.0, maxCorrectGap: 12, minOption: 3, maxOption: 220, minRationaleCorrect: 60, minRationale: 30 };
const FLUID_TRIGGER = /lithium|digoxin|diuretic|furosemide|frusemide|thiazide|renal|kidney|dehydrat|vomit|diarrh|intravenous|\bIV\b/i;
const FLUID_DATA = /urine output|mL\/h|mL\/hr|sodium|potassium|\bNa\b|\bK\b/i;

export function validateCase(doc: CaseDoc, rules: Rules = loadRules()): string[] {
  const e: string[] = [];
  const need = (v: unknown, name: string) => { if (typeof v !== "string" || !v.trim()) e.push(`missing ${name}`); };
  for (const k of ["case_code", "title", "objective", "population", "setting", "primary_condition", "endpoint", "source", "pathophysiology"] as const) need(doc[k], k);
  if (!DOMAIN_CODES.includes(doc.primary_domain)) e.push(`primary_domain must be one of ${DOMAIN_CODES.join("/")}`);
  if (!["low", "moderate", "high"].includes(doc.difficulty)) e.push("difficulty must be low/moderate/high");
  if (doc.primary_condition && doc.title.toLowerCase().includes(doc.primary_condition.toLowerCase())) e.push("title reveals the primary condition (V3 s.3)");
  if ((doc.pathophysiology ?? "").length < 300) e.push("pathophysiology teaching section is too short (V3 s.15)");

  // Scope and presentation rules apply to everything a student reads. Cases may escalate to critical care as an
  // endpoint, so the critical-care pattern is not applied; advanced-practice, NP and glucose-unit rules are.
  const forbidden = forbiddenPatterns(rules).filter(f => f.id !== "critical-care");
  const visual = rules.visual_flag_patterns.map(p => ({ id: p.id, re: new RegExp(p.pattern, p.flags ?? "i") }));
  const stageText = (s: { narrative: string } & Partial<CaseStage>) => [s.narrative,
    ...(s.vitals ?? []).map(v => `${v.label} ${v.value}`), ...(s.assessment ?? []).map(a => `${a.system} ${a.finding}`),
    ...(s.labs ?? []).flatMap(l => l.items.map(i => `${i.label} ${i.value}`))].join("\n");
  const allStudentText = [doc.title, doc.opening?.narrative ?? "", ...doc.stages.map(stageText), ...doc.questions.flatMap(q => [q.stem, ...q.options.map(o => o.text)])].join("\n");
  for (const f of forbidden) if (f.re.test(allStudentText + "\n" + doc.questions.map(q => q.rationale_correct + Object.values(q.distractor_rationales).join(" ")).join("\n"))) e.push(`forbidden:${f.id}`);
  for (const v of visual) if (v.re.test(allStudentText)) e.push(`visual-flag:${v.id} (V3 s.5: never label or highlight values)`);
  if (/\b(high|low|critical|abnormal|normal|elevated|decreased|improving|worsening)\b\s*$/im.test(doc.stages.flatMap(s => (s.vitals ?? []).map(v => v.value)).join("\n")))
    e.push("a vital-sign value carries an interpretive label");

  // Addendum #3: fluid balance and electrolytes when the case involves renal, dehydration, electrolyte-active drugs or IV therapy.
  if (FLUID_TRIGGER.test(allStudentText) && !FLUID_DATA.test(doc.stages.map(stageText).join("\n")))
    e.push("case involves renal/dehydration/electrolyte-active drugs/IV therapy but no stage gives urine output or serum electrolytes (addendum #3)");

  // Stages
  if (!doc.opening?.narrative || !doc.opening.time_label) e.push("missing opening scenario or its time label");
  const stageIdx = new Map(doc.stages.map((s, i) => [s.key, i]));
  if (stageIdx.size !== doc.stages.length) e.push("stage keys must be unique");
  doc.stages.forEach((s, i) => { if (!s.time_label || !s.narrative) e.push(`stage ${i} (${s.key}) needs a time label and narrative`); });

  // Questions: 6 core in fixed CJ order, optional Q7-Q8 extensions
  const qs = [...doc.questions].sort((a, b) => a.position - b.position);
  if (qs.length < 6 || qs.length > 8) e.push(`a case has 6 to 8 questions (found ${qs.length})`);
  let lastStage = -1;
  qs.forEach((q, i) => {
    const tag = `Q${q.position}`;
    if (q.position !== i + 1) e.push(`${tag}: positions must run 1..N`);
    const want: CjStep = i < 6 ? CJ_STEPS[i] : "extension";
    if (q.cj_step !== want) e.push(`${tag}: clinical-judgment step must be ${want} (V3 s.7)`);
    if (!DOMAIN_CODES.includes(q.domain)) e.push(`${tag}: one primary domain from ${DOMAIN_CODES.join("/")}`);
    if (!(q.taxonomy in TAXONOMIES)) e.push(`${tag}: one taxonomy KC/AP/ASE`);
    const si = stageIdx.get(q.stage);
    if (si === undefined) e.push(`${tag}: stage "${q.stage}" does not exist`);
    else { if (si < lastStage) e.push(`${tag}: stages must not go backwards`); lastStage = si; }
    if (!q.stem?.trim()) e.push(`${tag}: missing stem`);
    const labels = (q.options ?? []).map(o => o.label).join("");
    if (labels !== "ABCD") e.push(`${tag}: four options labelled A-D`);
    if (q.correct?.length !== 1) e.push(`${tag}: exactly one correct option`);
    const key = q.correct?.[0];
    if (q.option_types?.[key] !== "correct") e.push(`${tag}: the keyed option must be typed correct`);
    const others = Object.entries(q.option_types ?? {}).filter(([l]) => l !== key).map(([, t]) => t);
    if (q.format === "negative") { if (others.some(t => t !== "not_asked")) e.push(`${tag}: negative-format distractors are typed not_asked`); }
    else if (others.length !== 3 || others.some(t => !(CASE_OPTION_TYPES as readonly string[]).includes(t) || t === "correct"))
      e.push(`${tag}: distractor types must be close/priority/incorrect/unsafe`);
    const texts = (q.options ?? []).map(o => o.text.trim());
    if (/all of the above|none of the above/i.test(texts.join(" "))) e.push(`${tag}: no all/none of the above`);
    const lens = texts.map(t => t.length);
    if (lens.length === 4) {
      if (Math.min(...lens) < LEN.minOption || Math.max(...lens) > LEN.maxOption) e.push(`${tag}: option length out of range`);
      if (Math.max(...lens) / Math.min(...lens) > LEN.maxRatio) e.push(`${tag}: option lengths too uneven (V3 s.9)`);
      const ki = "ABCD".indexOf(key); const rest = lens.filter((_, j) => j !== ki);
      if (ki >= 0 && lens[ki] - rest.reduce((a, b) => a + b, 0) / 3 > LEN.maxCorrectGap) e.push(`${tag}: the key is noticeably longer than the distractors`);
    }
    if ((q.rationale_correct ?? "").trim().length < LEN.minRationaleCorrect) e.push(`${tag}: correct-answer rationale too short`);
    for (const l of "ABCD".split("").filter(l => l !== key)) if ((q.distractor_rationales?.[l] ?? "").trim().length < LEN.minRationale) e.push(`${tag}: rationale missing for option ${l}`);
    if (!q.self_test?.trim()) e.push(`${tag}: missing self-test sentence (addendum #5)`);
    else if (/\b(obviously|clearly)\b/i.test(q.self_test)) e.push(`${tag}: self-test uses "obviously/clearly"; rewrite the distractor (addendum #5)`);
    if (!q.meta?.topic || !q.meta?.subtopic) e.push(`${tag}: metadata needs topic and subtopic (V3 s.16)`);
  });
  return e;
}

/** Simple blueprint tally for a set of cases, against the case-bank targets (V3 s.2.1, s.2.2). */
export const CASE_BANK_TARGETS = {
  domain: { NP: 35, CDM: 35, HPMW: 10, NLM: 5, PC: 5, COM: 5, PD: 5 },
  taxonomy: { KC: 10, AP: 40, ASE: 50 },
} as const;
