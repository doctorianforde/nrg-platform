/**
 * Generation requests: the one input shape for every content generator (stand-alone MCQs, case studies, and any
 * generator added later). Pure TypeScript, no I/O, so the teacher UI can validate and preview a request with the same
 * code the CLI runs.
 *
 * Two modes:
 *   - auto      Jade picks the selections (domain, cluster, topic, taxonomy, difficulty, …) himself. Anything left
 *               empty falls back to the RENR blueprint weights.
 *   - prompted  Jade writes what he wants in his own words. An interpreter (heuristic or model, see interpret.ts)
 *               turns the prompt into the same selections, Jade confirms them, and the prompt still travels to the
 *               generator as guidance.
 * Both modes compile to the same plan, so the MCQ / case standards apply unchanged: a prompt can steer content but
 * cannot switch a rule off. Conflicts are reported back (interpretation.conflicts), never silently honoured.
 */
import {
  CASE_DIFFICULTIES, CLUSTER_CODES, DOMAIN_CODES, GENERATOR_KINDS, MCQ_DIFFICULTIES, SPECIALTY_CODES, TAXONOMY_CODES,
  CASE_SPECIALTIES, CLUSTERS, DOMAINS, TAXONOMY,
  type CaseDifficulty, type ClusterCode, type DomainCode, type GeneratorKind, type McqDifficulty, type SpecialtyCode, type TaxonomyCode,
} from "./taxonomy";

/** A mix along one axis: a list splits evenly across its codes; a record gives percentages that sum to 100. */
export type Mix<C extends string> = C[] | Partial<Record<C, number>>;

/** A topic from the `topics` table (id set) or a new free-text one (created on insert, flagged as a warning). */
export type TopicRef = { id?: number; name: string; cluster?: ClusterCode };

export type McqSelections = {
  domains?: Mix<DomainCode>;
  taxonomy?: Mix<TaxonomyCode>;
  clusters?: Mix<ClusterCode>;
  topics?: TopicRef[];               // when set, items are spread evenly across these and each item's cluster is its topic's
  difficulty?: Mix<McqDifficulty>;   // ignored while generation-rules.json has drop_difficulty on
  exclusions?: string;
};

export type CaseSelections = {
  specialties?: SpecialtyCode[];
  conditions?: string[];             // catalog conditions or free text; free text needs a population and setting from the author
  population?: string;
  setting?: string;
  difficulty?: CaseDifficulty[];
  primary_domains?: DomainCode[];    // default alternates CDM / NP (V3 s.2.1)
  extension_domains?: DomainCode[];  // Q7/Q8 domains; default steers the bank toward V3's targets
};

export type Interpretation = {
  by: string;                        // "heuristic", "anthropic/claude-sonnet-5-5", "agent:claude-code", …
  at: string;                        // ISO time
  notes: string[];                   // what was read from the prompt
  conflicts: string[];               // asks the standard won't allow (critical care, SATA, mmol/L glucose, …)
  unresolved: string[];              // phrases kept as guidance only (e.g. a topic not in the topic list)
  confirmed: boolean;                // Jade has seen the selections and accepted them
};

type Base = {
  mode: "auto" | "prompted";
  count: number;
  title?: string;
  prompt?: string;                   // required in prompted mode; an optional note to the author in auto mode
  requested_by?: string;
  interpretation?: Interpretation;
};
export type McqRequest = Base & { kind: "mcq"; selections: McqSelections };
export type CaseRequest = Base & { kind: "case_study"; selections: CaseSelections };
export type GenerationRequest = McqRequest | CaseRequest;

export const MAX_PROMPT_CHARS = 4000;

export type Validated = { ok: true; request: GenerationRequest; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

/** Validates and normalises a request (from JSON, a form, or an interpreter). Unknown codes are errors, not dropped. */
export function validateRequest(raw: unknown): Validated {
  const errors: string[] = [], warnings: string[] = [];
  // Untrusted input (a form, a JSON file, an interpreter): every field used is checked below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw ?? {}) as Record<string, any>;
  const kind = r.kind as GeneratorKind;
  const spec = GENERATOR_KINDS.find(k => k.kind === kind);
  if (!spec) return { ok: false, errors: [`kind must be one of ${GENERATOR_KINDS.map(k => k.kind).join(", ")}`], warnings };
  const mode = r.mode;
  if (mode !== "auto" && mode !== "prompted") errors.push("mode must be auto or prompted");
  // A prompted request may leave count out ("15 questions on …" says it); the interpreter fills it in.
  const count = r.count == null && mode === "prompted" && !r.interpretation ? 0 : Number(r.count);
  if (count !== 0 && (!Number.isInteger(count) || count < 1 || count > spec.maxCount)) errors.push(`count must be a whole number from 1 to ${spec.maxCount}`);
  if (count === 0 && mode !== "prompted") errors.push("count is required");
  const prompt = typeof r.prompt === "string" ? r.prompt.trim() : "";
  if (prompt.length > MAX_PROMPT_CHARS) errors.push(`prompt is longer than ${MAX_PROMPT_CHARS} characters`);
  if (mode === "prompted" && !prompt) errors.push("prompted mode needs a prompt");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (r.selections ?? {}) as Record<string, any>;

  let selections: McqSelections | CaseSelections;
  if (kind === "mcq") {
    const sel: McqSelections = {};
    if (s.domains !== undefined) sel.domains = checkMix("domains", s.domains, DOMAIN_CODES, errors);
    if (s.taxonomy !== undefined) sel.taxonomy = checkMix("taxonomy", s.taxonomy, TAXONOMY_CODES, errors);
    if (s.clusters !== undefined) sel.clusters = checkMix("clusters", s.clusters, CLUSTER_CODES, errors);
    if (s.difficulty !== undefined) sel.difficulty = checkMix("difficulty", s.difficulty, MCQ_DIFFICULTIES, errors);
    if (s.topics !== undefined) {
      if (!Array.isArray(s.topics)) errors.push("topics must be a list");
      else {
        sel.topics = [];
        for (const t of s.topics) {
          const name = String(t?.name ?? "").trim();
          if (!name) { errors.push("every topic needs a name"); continue; }
          if (t.cluster !== undefined && !CLUSTER_CODES.includes(t.cluster)) { errors.push(`topic "${name}": unknown cluster ${t.cluster}`); continue; }
          if (t.id === undefined) warnings.push(`topic "${name}" is not in the topic list; it will be created when the items are inserted`);
          sel.topics.push({ ...(t.id !== undefined ? { id: Number(t.id) } : {}), name, ...(t.cluster ? { cluster: t.cluster } : {}) });
        }
        if (count && sel.topics.length > count) warnings.push(`${sel.topics.length} topics for ${count} items: some topics will get no item`);
        if (sel.topics.length && sel.clusters) warnings.push("topics are set, so the cluster mix is ignored (each item takes its topic's cluster)");
      }
    }
    if (s.exclusions !== undefined) sel.exclusions = String(s.exclusions);
    selections = sel;
  } else {
    const sel: CaseSelections = {};
    if (s.specialties !== undefined) sel.specialties = checkList("specialties", s.specialties, SPECIALTY_CODES, errors);
    if (s.difficulty !== undefined) sel.difficulty = checkList("difficulty", s.difficulty, CASE_DIFFICULTIES, errors);
    if (s.primary_domains !== undefined) sel.primary_domains = checkList("primary_domains", s.primary_domains, DOMAIN_CODES, errors);
    if (s.extension_domains !== undefined) sel.extension_domains = checkList("extension_domains", s.extension_domains, DOMAIN_CODES, errors);
    if (s.conditions !== undefined) {
      if (!Array.isArray(s.conditions)) errors.push("conditions must be a list");
      else sel.conditions = Array.from(new Set(s.conditions.map((c: unknown) => String(c).trim()).filter(Boolean))) as string[];
      if (count && sel.conditions && sel.conditions.length > count) warnings.push(`${sel.conditions.length} conditions for ${count} case(s): only the first ${count} are used`);
    }
    if (s.population !== undefined) sel.population = String(s.population).trim();
    if (s.setting !== undefined) sel.setting = String(s.setting).trim();
    if (sel.primary_domains?.some(d => d !== "CDM" && d !== "NP")) warnings.push("V3 s.2.1 expects CDM or NP as a case's primary domain");
    selections = sel;
  }

  const interpretation = r.interpretation as Interpretation | undefined;
  if (mode === "prompted" && interpretation && !interpretation.confirmed) warnings.push("the interpretation has not been confirmed yet");
  if (errors.length) return { ok: false, errors, warnings };
  const request = {
    kind, mode, count, selections,
    ...(r.title ? { title: String(r.title).trim() } : {}),
    ...(prompt ? { prompt } : {}),
    ...(r.requested_by ? { requested_by: String(r.requested_by) } : {}),
    ...(interpretation ? { interpretation } : {}),
  } as GenerationRequest;
  return { ok: true, request, warnings };
}

/** A request may run when it is valid and, in prompted mode, its interpretation has been confirmed. */
export function readyToRun(req: GenerationRequest): string | null {
  if (!req.count) return "no count: set one, or say how many in the prompt";
  if (req.mode === "prompted" && !req.interpretation) return "the prompt has not been interpreted yet";
  if (req.mode === "prompted" && !req.interpretation!.confirmed) return "the interpretation is waiting for confirmation";
  return null;
}

function checkList<C extends string>(axis: string, v: unknown, allowed: readonly C[], errors: string[]): C[] {
  if (!Array.isArray(v)) { errors.push(`${axis} must be a list`); return []; }
  const bad = v.filter(x => !allowed.includes(x as C));
  if (bad.length) errors.push(`${axis}: unknown ${bad.join(", ")} (allowed: ${allowed.join(", ")})`);
  return Array.from(new Set(v.filter(x => allowed.includes(x as C)))) as C[];
}
function checkMix<C extends string>(axis: string, v: unknown, allowed: readonly C[], errors: string[]): Mix<C> {
  if (Array.isArray(v)) {
    const list = checkList(axis, v, allowed, errors);
    if (!list.length) errors.push(`${axis}: pick at least one, or leave it out for the blueprint mix`);
    return list;
  }
  if (!v || typeof v !== "object") { errors.push(`${axis} must be a list of codes or a {code: percent} record`); return []; }
  const rec = v as Record<string, unknown>;
  const bad = Object.keys(rec).filter(k => !allowed.includes(k as C));
  if (bad.length) errors.push(`${axis}: unknown ${bad.join(", ")} (allowed: ${allowed.join(", ")})`);
  const vals = Object.values(rec).map(Number);
  if (vals.some(n => !Number.isFinite(n) || n < 0)) errors.push(`${axis}: percentages must be numbers ≥ 0`);
  const sum = vals.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) errors.push(`${axis}: percentages must sum to 100 (got ${sum})`);
  return Object.fromEntries(Object.entries(rec).map(([k, n]) => [k, Number(n)])) as Mix<C>;
}

/** Turns a mix into planner weights over `base`; no mix means the base (blueprint) weights. */
export function mixWeights<C extends string>(base: readonly { code: C; pct: number }[], mix?: Mix<C>): { code: C; pct: number }[] {
  if (!mix) return base.map(b => ({ code: b.code, pct: b.pct }));
  if (Array.isArray(mix)) return base.map(b => ({ code: b.code, pct: mix.includes(b.code) ? 1 : 0 }));
  return base.map(b => ({ code: b.code, pct: (mix as Record<string, number>)[b.code] ?? 0 }));
}

/** One line per choice, for the confirmation step (CLI now, the teacher UI later). */
export function describeRequest(req: GenerationRequest): string[] {
  const mix = (m: Mix<string> | undefined, all: readonly { code: string; name: string }[]) =>
    !m ? "blueprint mix" : Array.isArray(m) ? m.map(c => all.find(a => a.code === c)?.name ?? c).join(", ")
      : Object.entries(m).filter(([, p]) => (p ?? 0) > 0).map(([c, p]) => `${all.find(a => a.code === c)?.name ?? c} ${p}%`).join(", ");
  const head = `${req.count} ${req.kind === "mcq" ? "stand-alone question(s)" : "case stud(y/ies)"} · ${req.mode} mode${req.title ? ` · "${req.title}"` : ""}`;
  const lines = [head];
  if (req.kind === "mcq") {
    const s = req.selections;
    lines.push(`Domains: ${mix(s.domains, DOMAINS)}`, `Taxonomy: ${mix(s.taxonomy, TAXONOMY)}`);
    lines.push(s.topics?.length ? `Topics: ${s.topics.map(t => t.name).join("; ")}` : `Clusters: ${mix(s.clusters, CLUSTERS)}`);
    lines.push(`Difficulty: ${mix(s.difficulty, MCQ_DIFFICULTIES.map(d => ({ code: d, name: d })))}`);
    if (s.exclusions) lines.push(`Exclusions: ${s.exclusions}`);
  } else {
    const s = req.selections;
    lines.push(`Specialties: ${s.specialties?.map(c => CASE_SPECIALTIES.find(x => x.code === c)!.name).join(", ") ?? "catalog weights"}`);
    lines.push(`Conditions: ${s.conditions?.join("; ") ?? "next unused in the catalog"}`);
    if (s.population || s.setting) lines.push(`Patient: ${[s.population, s.setting].filter(Boolean).join(", ")}`);
    lines.push(`Difficulty: ${s.difficulty?.join(", ") ?? "rotated"}`, `Primary domain: ${s.primary_domains?.join(", ") ?? "alternating CDM / NP"}`);
    lines.push(`Q7/Q8 domains: ${s.extension_domains?.join(", ") ?? "chosen to balance the bank"}`);
  }
  if (req.prompt) lines.push(`Request in your words (passed to the author as guidance): ${req.prompt}`);
  const i = req.interpretation;
  if (i) {
    lines.push(`Interpreted by ${i.by}${i.confirmed ? ", confirmed" : ", NOT yet confirmed"}`);
    i.conflicts.forEach(c => lines.push(`  ✗ won't be followed: ${c}`));
    i.unresolved.forEach(u => lines.push(`  ? kept as guidance only: ${u}`));
  }
  return lines;
}
