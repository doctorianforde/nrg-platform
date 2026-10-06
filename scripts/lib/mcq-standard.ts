/**
 * MCQ authoring standard — the one validator shared by the generator
 * (scripts/generate-questions.ts) and the bank review tool (scripts/review-bank.ts).
 * Rules live in scripts/generation-rules.json; settled rules are enforced, open
 * items sit behind switches_pending_jade.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Pat = { id: string; pattern: string; flags?: string };
export type Rules = {
  version: string; forbidden_patterns: Pat[]; visual_flag_patterns: Pat[]; option_types: string[];
  length_cue: { max_len_ratio: number; max_correct_gap: number; min_option_chars: number; max_option_chars: number; min_rationale_chars: number; max_batch_pct_longest: number; max_batch_pct_any_position: number };
  near_duplicate_jaccard: number; abbreviation_allowlist: string[];
  switches_pending_jade: { block_nursing_diagnosis_items: boolean; drop_difficulty: boolean; regional_wording_not_tt: boolean; enforce_abbreviation_rule: boolean; extra_forbidden_patterns: Pat[] };
  store_option_types: boolean;
};
export type Checked = {
  stem: string; options: { label: string; text: string }[]; correct: string[];
  rationale_correct: string; distractor_rationales: Record<string, string>; option_types: Record<string, string>;
};

export function loadRules(path = "scripts/generation-rules.json"): Rules {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

const compile = (l: Pat[]) => l.map(x => ({ id: x.id, re: new RegExp(x.pattern, x.flags ?? "i") }));
export function forbiddenPatterns(rules: Rules) {
  const sw = rules.switches_pending_jade;
  return compile([
    ...rules.forbidden_patterns,
    ...(sw.block_nursing_diagnosis_items ? [{ id: "nursing-diagnosis", pattern: "nurs(e|ing)[ -]diagnos|\\bNANDA\\b" }] : []),
    ...sw.extra_forbidden_patterns,
  ]);
}

export const tok = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 2));
export const jacc = (a: Set<string>, b: Set<string>) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };

/** Checks one item's content against the standard. Tags (domain, taxonomy, topic) are the caller's business. */
export function checkMcq(raw: any, rules: Rules, opts: { optionsPerItem?: number; allowSata?: boolean } = {}):
  { ok: true; item: Checked; warnings: string[] } | { ok: false; error: string } {
  const n = opts.optionsPerItem ?? 4, allowSata = opts.allowSata ?? false;
  const sw = rules.switches_pending_jade, L = rules.length_cue;
  const w: string[] = [];
  if (!raw || typeof raw.stem !== "string" || raw.stem.trim().length < 20) return { ok: false, error: "missing/short stem" };
  if (!Array.isArray(raw.options) || raw.options.length !== n) return { ok: false, error: `expected ${n} options` };
  const labels = raw.options.map((o: any) => String(o.label ?? "").toUpperCase());
  const expected = "ABCDEF".slice(0, n).split("");
  if (labels.join("") !== expected.join("")) return { ok: false, error: `option labels ${labels.join("")} ≠ ${expected.join("")}` };
  if (raw.options.some((o: any) => !o.text || String(o.text).trim().length < 1)) return { ok: false, error: "blank option" };
  const correct: string[] = (Array.isArray(raw.correct) ? raw.correct : [raw.correct]).map((c: any) => String(c).toUpperCase());
  if (correct.some(c => !expected.includes(c))) return { ok: false, error: `correct ${correct} not in options` };
  if (!allowSata && correct.length !== 1) return { ok: false, error: "must have exactly one correct option" };
  if (!raw.rationale_correct) return { ok: false, error: "missing rationale_correct" };
  if (/all of the above|none of the above/i.test(raw.options.map((o: any) => o.text).join(" "))) return { ok: false, error: "all/none of the above" };
  if (!allowSata && /select all that apply/.test(raw.stem.toLowerCase())) return { ok: false, error: "SATA stem when not allowed" };
  const types: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.option_types ?? {})) types[k.toUpperCase()] = String(v).toLowerCase();
  if (Object.keys(types).length !== n || Object.values(types).sort().join(",") !== [...rules.option_types].sort().join(","))
    return { ok: false, error: `option_types must be one each of ${rules.option_types.join("/")}` };
  if (types[correct[0]] !== "correct") return { ok: false, error: "keyed option is not typed 'correct'" };
  const dr: Record<string, string> = Object.fromEntries(Object.entries(raw.distractor_rationales ?? {}).map(([k, v]) => [k.toUpperCase(), String(v ?? "")]));
  for (const l of expected.filter(x => !correct.includes(x))) if ((dr[l] ?? "").trim().length < 30) return { ok: false, error: `missing/short rationale for option ${l}` };
  if (String(raw.rationale_correct).trim().length < L.min_rationale_chars) return { ok: false, error: "correct-answer rationale too short" };
  const optTexts: string[] = raw.options.map((o: any) => String(o.text));
  const allText = [raw.stem, ...optTexts, raw.rationale_correct, ...Object.values(dr)].join(" \n ");
  for (const f of forbiddenPatterns(rules)) if (f.re.test(allText)) return { ok: false, error: `forbidden:${f.id}` };
  const visText = [raw.stem, ...optTexts].join("\n");
  for (const v of compile(rules.visual_flag_patterns)) if (v.re.test(visText)) return { ok: false, error: `visual-flag:${v.id}` };
  const lens = optTexts.map(t => t.trim().length);
  if (Math.min(...lens) < L.min_option_chars || Math.max(...lens) > L.max_option_chars) return { ok: false, error: "option length out of range" };
  if (Math.max(...lens) / Math.min(...lens) > L.max_len_ratio) return { ok: false, error: "option length spread too wide" };
  const ci = expected.indexOf(correct[0]);
  const others = lens.filter((_, i) => i !== ci);
  if (lens[ci] - others.reduce((a, b) => a + b, 0) / others.length > L.max_correct_gap) return { ok: false, error: "correct option longer than distractors" };
  const abbr = [...new Set<string>(String(raw.stem).match(/\b[A-Z]{2,6}\b/g) ?? [])].filter(a => !rules.abbreviation_allowlist.includes(a) && !new RegExp(`\\(${a}\\)`).test(raw.stem));
  if (abbr.length) { if (sw.enforce_abbreviation_rule) return { ok: false, error: `abbreviation without full name: ${abbr.join(",")}` }; w.push(`abbreviation(s) not expanded: ${abbr.join(",")}`); }
  return { ok: true, warnings: w, item: {
    stem: String(raw.stem).trim(), options: raw.options.map((o: any) => ({ label: String(o.label).toUpperCase(), text: String(o.text).trim() })),
    correct, rationale_correct: String(raw.rationale_correct).trim(),
    distractor_rationales: Object.fromEntries(Object.entries(dr).map(([k, v]) => [k, String(v)])), option_types: types,
  } };
}
