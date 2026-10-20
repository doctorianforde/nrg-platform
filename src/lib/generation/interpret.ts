/**
 * Prompted mode: turning Jade's own words into a request's selections.
 *
 * Two interpreters share one output shape (`InterpretResult`):
 *   - heuristicInterpret(): offline keyword matching. Instant, free, deterministic. Good for a live preview and
 *     for clear prompts ("15 analysis questions on postpartum haemorrhage").
 *   - a model or agent, given interpretSystemPrompt() + the prompt; its JSON goes through parseInterpretation(),
 *     which validates every code and resolves topic phrases against the real topic list.
 * Either way the result is a proposal: Jade confirms it before anything is generated (Interpretation.confirmed).
 */
import { validateRequest, type CaseSelections, type GenerationRequest, type Interpretation, type McqSelections, type TopicRef } from "./request";
import {
  CASE_SPECIALTIES, CLUSTERS, DOMAINS, GENERATOR_KINDS, TAXONOMY,
  type ClusterCode, type DomainCode, type GeneratorKind, type SpecialtyCode, type TaxonomyCode,
} from "./taxonomy";

export type TopicRow = { id: number; name: string; cluster?: ClusterCode | null };
export type InterpretContext = { topics?: TopicRow[]; caseConditions?: string[]; allowSata?: boolean };
export type InterpretResult = {
  count?: number; title?: string;
  selections: McqSelections | CaseSelections;
  notes: string[]; conflicts: string[]; unresolved: string[];
};

// ─── Scope conflicts: asks the standard won't honour, whatever the prompt says ──────────────────────────────
const CONFLICTS: { re: RegExp; why: string }[] = [
  { re: /\b(icu|ccu|nicu|picu|intensive care|critical care|vasopressor|ventilat)/i, why: "critical-care content is out of scope for the entry-level RN (MCQ standard rule 1)" },
  { re: /nurse practitioner|advanced[- ]practice/i, why: "advanced-practice content is out of scope (MCQ standard rule 1)" },
  { re: /mmol\/?l?\b[^.]{0,30}(glucose|sugar)|(glucose|sugar)[^.]{0,30}mmol/i, why: "blood glucose is always written in mg/dL, never mmol/L (project rule)" },
  { re: /\b(image|picture|photo|diagram|ecg strip|rhythm strip|x-?ray film)s?\b/i, why: "items cannot depend on images" },
  { re: /all of the above|none of the above/i, why: "\"all/none of the above\" options are not allowed" },
];
const SATA_RE = /select[- ]all[- ]that[- ]apply|\bsata\b|multiple[- ]response/i;

// ─── Vocabulary ─────────────────────────────────────────────────────────────────────────────────────────────
const TAX_WORDS: [RegExp, TaxonomyCode][] = [
  [/\b(analy[sz]\w*|synthes\w*|evaluat\w*|higher[- ]order|critical thinking|prioriti[sz]\w*|clinical judge?ment)\b/i, "ASE"],
  [/\b(appl(y|ication)|scenario[- ]based)\b/i, "AP"],
  [/\b(knowledge|comprehension|recall|definitions?|facts?)\b/i, "KC"],
];
const CLUSTER_WORDS: [RegExp, ClusterCode][] = [
  [/\b(med[- ]?surg\w*|medical[- ]surgical|cardiac|endocrine|renal|respiratory|diabet\w*|cancer|oncolog\w*|trauma)\b/i, "MEDSURG"],
  [/\b(infection control|ppe|medication safety|dosage|iv therapy|oxygen therapy|cpr|wound care|core procedures?)\b/i, "SAFETY"],
  [/\b(maternal|matern\w*|obstetric\w*|antenatal|postpartum|postnatal|newborn|neonat\w*|p(a)?ediatric\w*|child(ren)?|labou?r and delivery)\b/i, "MATCHILD"],
  [/\b(leadership|management|delegat\w*|ethic\w*|legal|professionalism)\b/i, "MGMT"],
  [/\b(psych\w*|mental health|anxiety|depress\w*|substance|therapeutic communication)\b/i, "PSYCHSOC"],
];
const SPECIALTY_WORDS: [RegExp, SpecialtyCode][] = [
  [/\b(med[- ]?surg\w*|medical[- ]surgical|surgical ward|medical ward)\b/i, "MS"],
  [/\b(p(a)?ediatric\w*|child(ren)?|infant|toddler)\b/i, "PD"],
  [/\b(obstetric\w*|maternal|pregnan\w*|antenatal|postpartum|labou?r)\b/i, "OB"],
  [/\b(mental health|psychiatric|psych ward)\b/i, "MH"],
  [/\b(community|district|health centre|home visit)\b/i, "CH"],
];
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter(w => w.length > 2));

/** Offline interpreter. Never invents codes: everything it returns passes validateRequest. */
export function heuristicInterpret(kind: GeneratorKind, prompt: string, ctx: InterpretContext = {}): InterpretResult {
  const notes: string[] = [], conflicts: string[] = [], unresolved: string[] = [];
  const text = ` ${prompt} `;
  for (const c of CONFLICTS) if (c.re.test(text)) conflicts.push(c.why);
  if (kind === "mcq" && !ctx.allowSata && SATA_RE.test(text)) conflicts.push("select-all-that-apply is switched off; every item has one best answer");

  const unit = kind === "mcq" ? "(questions?|items?|mcqs?)" : "(cases?|case stud(y|ies)|scenarios?)";
  let count: number | undefined;
  const m = text.match(new RegExp(`\\b(\\d{1,3}|${Object.keys(NUM_WORDS).join("|")})\\s+(?:[a-z-]+\\s+){0,5}${unit}\\b`, "i"));
  if (m) {
    count = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()];
    const max = GENERATOR_KINDS.find(k => k.kind === kind)!.maxCount;
    if (count > max) { conflicts.push(`${count} is more than one request allows (${max}); capped`); count = max; }
    notes.push(`count ${count}`);
  }

  const domainHits = DOMAINS.filter(d => new RegExp(`\\b${d.code}\\b`).test(text) || text.toLowerCase().includes(d.name.toLowerCase())).map(d => d.code as DomainCode);

  if (kind === "mcq") {
    const sel: McqSelections = {};
    if (domainHits.length) { sel.domains = domainHits; notes.push(`domains ${domainHits.join(", ")}`); }
    const tax = Array.from(new Set(TAX_WORDS.filter(([re]) => re.test(text)).map(([, c]) => c)));
    if (tax.length) { sel.taxonomy = tax; notes.push(`taxonomy ${tax.join(", ")}`); }
    const diff = (["easy", "medium", "hard"] as const).filter(d => new RegExp(`\\b${d}\\b`, "i").test(text));
    if (/\b(difficult|challenging|tough)\b/i.test(text) && !diff.includes("hard")) diff.push("hard");
    if (diff.length) { sel.difficulty = diff; notes.push(`difficulty ${diff.join(", ")}`); }
    const topics = ctx.topics ? matchTopics(prompt, ctx.topics) : [];
    if (topics.length) { sel.topics = topics; notes.push(`topics ${topics.map(t => t.name).join("; ")}`); }
    else {
      const cl = Array.from(new Set(CLUSTER_WORDS.filter(([re]) => re.test(text)).map(([, c]) => c)));
      if (cl.length) { sel.clusters = cl; notes.push(`clusters ${cl.join(", ")}`); }
      if (!ctx.topics) unresolved.push("no topic list was given, so topics were not matched");
    }
    const ex = prompt.match(/\b(?:avoid|exclude|no|without)\s+([^.;\n]{3,80})/i);
    if (ex && !SATA_RE.test(ex[1])) { sel.exclusions = ex[1].trim(); notes.push(`exclusions "${sel.exclusions}"`); }
    return { count, selections: sel, notes, conflicts, unresolved };
  }

  const sel: CaseSelections = {};
  const sp = Array.from(new Set(SPECIALTY_WORDS.filter(([re]) => re.test(text)).map(([, c]) => c)));
  if (sp.length) { sel.specialties = sp; notes.push(`specialties ${sp.join(", ")}`); }
  const conds = (ctx.caseConditions ?? []).filter(c => text.toLowerCase().includes(c.toLowerCase()));
  if (conds.length) { sel.conditions = conds; notes.push(`conditions ${conds.join("; ")}`); }
  const diff = (["low", "moderate", "high"] as const).filter(d => new RegExp(`\\b${d} (difficulty|complexity)\\b`, "i").test(text));
  if (/\b(hard|difficult|challenging|complex)\b/i.test(text) && !diff.includes("high")) diff.push("high");
  if (/\b(easy|simple|introductory)\b/i.test(text) && !diff.includes("low")) diff.push("low");
  if (diff.length) { sel.difficulty = diff; notes.push(`difficulty ${diff.join(", ")}`); }
  if (domainHits.length) {
    const prim = domainHits.filter(d => d === "CDM" || d === "NP"), ext = domainHits.filter(d => d !== "CDM" && d !== "NP");
    if (prim.length) sel.primary_domains = prim;
    if (ext.length) sel.extension_domains = ext;
    notes.push(`domains ${domainHits.join(", ")}`);
  }
  if (!conds.length) unresolved.push("condition: none matched the catalog; the author takes it from the prompt");
  return { count, selections: sel, notes, conflicts, unresolved };
}

/** Topic phrases → topic rows. Exact name containment first; then the best token overlap (≥ 0.6) per phrase. */
export function matchTopics(prompt: string, topics: TopicRow[], max = 10): TopicRef[] {
  const p = ` ${norm(prompt)} `;
  const hits = topics
    .map(t => ({ t, full: norm(t.name), base: norm(t.name.split("—")[0]), sub: t.name.includes("—") ? norm(t.name.split("—")[1]) : "" }))
    .map(x => ({ ...x, phrase: p.includes(` ${x.full} `) ? x.full : x.sub && x.sub.length >= 4 && p.includes(` ${x.sub} `) ? x.sub : "" }))
    .filter(x => x.full.length >= 3 && x.phrase);
  // Keep the most specific reading of each phrase: "postpartum haemorrhage" drops "Postpartum", and a subtopic
  // ("Trauma — head injury") drops its parent ("Trauma"). Two topics read from the same phrase (the bank has
  // near-duplicates like "Head Injury" and "Trauma — head injury") keep only the first, preferring an exact name.
  const inside = (a: string, b: string) => a !== b && ` ${b} `.includes(` ${a} `);
  const specific = hits
    .filter(h => !hits.some(o => inside(h.phrase, o.phrase) || (o.phrase === h.phrase && o.full.startsWith(h.full + " "))))
    .sort((a, b) => Number(b.full === b.phrase) - Number(a.full === a.phrase))
    .filter((h, i, all) => all.findIndex(o => o.phrase === h.phrase) === i);
  return specific.slice(0, max).map(h => ({ id: h.t.id, name: h.t.name, ...(h.t.cluster ? { cluster: h.t.cluster } : {}) }));
}

/** Resolves free-text topic phrases (from a model) to topic rows. Unmatched phrases come back separately. */
export function resolveTopicPhrases(phrases: string[], topics: TopicRow[]): { topics: TopicRef[]; unmatched: string[] } {
  const out: TopicRef[] = [], unmatched: string[] = [];
  for (const ph of phrases) {
    const w = words(ph);
    let best: { t: TopicRow; s: number } | null = null;
    for (const t of topics) {
      const n = norm(t.name), q = norm(ph);
      let s = n === q ? 2 : n.includes(q) || q.includes(n) ? 1.2 : 0;
      if (!s) { const tw = words(t.name); let i = 0; for (const x of Array.from(w)) if (tw.has(x)) i++; s = i / (w.size + tw.size - i || 1); }
      if (!best || s > best.s || (s === best.s && t.name.length < best.t.name.length)) best = { t, s };
    }
    if (best && best.s >= 0.6) { if (!out.some(o => o.id === best!.t.id)) out.push({ id: best.t.id, name: best.t.name, ...(best.t.cluster ? { cluster: best.t.cluster } : {}) }); }
    else unmatched.push(ph);
  }
  return { topics: out, unmatched };
}

/** System prompt for a model or agent interpreter. The reply is parsed with parseInterpretation(). */
export function interpretSystemPrompt(kind: GeneratorKind): string {
  const codes = (xs: readonly { code: string; name: string }[]) => xs.map(x => `${x.code} = ${x.name}`).join("; ");
  const shape = kind === "mcq"
    ? `"selections":{"domains":[codes]|{code:pct},"taxonomy":[codes]|{code:pct},"clusters":[codes]|{code:pct},"topic_phrases":["short topic names"],"difficulty":["easy"|"medium"|"hard"],"exclusions":"text"}`
    : `"selections":{"specialties":[codes],"conditions":["condition names"],"population":"text","setting":"text","difficulty":["low"|"moderate"|"high"],"primary_domains":[codes],"extension_domains":[codes]}`;
  return `You turn a nursing educator's request for ${kind === "mcq" ? "RENR-style multiple-choice questions" : "RENR unfolding case studies"} into structured selections. You do not write any questions.

Codes you may use (no others):
- Domains: ${codes(DOMAINS)}
- Taxonomy: ${codes(TAXONOMY)}
${kind === "mcq" ? `- Clusters: ${codes(CLUSTERS)}` : `- Specialties: ${codes(CASE_SPECIALTIES)}`}

Rules:
- Set only what the request actually asks for. Leave everything else out: unset axes fall back to the official RENR blueprint.
- Use a list for "mostly / only these"; use a {code: percent} record summing to 100 only when the request gives proportions.
- "count" is the number asked for, if stated.
- Content the platform will not produce goes in "conflicts", with the reason: critical-care or ICU management, advanced-practice or nurse-practitioner decisions, image-dependent items, blood glucose in mmol/L (always mg/dL), "all/none of the above"${kind === "mcq" ? ", select-all-that-apply" : ""}.
- Anything you cannot map to a code goes in "unresolved"; it is kept as guidance for the author.
- "notes" says in a few words what you read from the request.

Reply with one JSON object and nothing else:
{"count":<number or null>,"title":"<short title or null>",${shape},"notes":[],"conflicts":[],"unresolved":[]}`;
}

/** Validates a model/agent interpretation and resolves its topic phrases. Throws with every problem listed. */
export function parseInterpretation(kind: GeneratorKind, raw: unknown, ctx: InterpretContext = {}): InterpretResult {
  // Untrusted JSON from a model or agent: every field is checked below and again by validateRequest.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (raw ?? {}) as Record<string, any>, sel = { ...(r.selections ?? {}) } as Record<string, any>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const unresolved = strs(r.unresolved), notes = strs(r.notes), conflicts = strs(r.conflicts);
  for (const k of Object.keys(sel)) if (sel[k] === null || (Array.isArray(sel[k]) && !sel[k].length)) delete sel[k];
  if (kind === "mcq" && sel.topic_phrases) {
    const phrases = strs(sel.topic_phrases); delete sel.topic_phrases;
    if (ctx.topics) {
      const res = resolveTopicPhrases(phrases, ctx.topics);
      if (res.topics.length) sel.topics = res.topics;
      res.unmatched.forEach(u => unresolved.push(`topic "${u}" is not in the topic list`));
    } else phrases.forEach(p => unresolved.push(`topic "${p}" (no topic list to match against)`));
  }
  const max = GENERATOR_KINDS.find(k => k.kind === kind)!.maxCount;
  let count = r.count == null ? undefined : Math.round(Number(r.count));
  if (count !== undefined && (!Number.isFinite(count) || count < 1)) count = undefined;
  if (count !== undefined && count > max) { conflicts.push(`${count} is more than one request allows (${max}); capped`); count = max; }
  const v = validateRequest({ kind, mode: "prompted", count: Math.min(count ?? 1, max), prompt: "x", selections: sel });
  if (!v.ok) throw new Error(`interpretation rejected: ${v.errors.join("; ")}`);
  return { count, title: r.title ? String(r.title) : undefined, selections: v.request.selections, notes, conflicts, unresolved };
}

/** Folds an interpretation into a prompted request. Explicit selections already on the request win over it. */
export function applyInterpretation(req: GenerationRequest, res: InterpretResult, by: string): GenerationRequest {
  const interpretation: Interpretation = { by, at: new Date().toISOString(), notes: res.notes, conflicts: res.conflicts, unresolved: res.unresolved, confirmed: false };
  return {
    ...req,
    count: req.count || res.count || 1,
    ...(req.title || !res.title ? {} : { title: res.title }),
    selections: { ...res.selections, ...req.selections },
    interpretation,
  } as GenerationRequest;
}
