/**
 * NRG — RENR-style question generator (provider-agnostic)
 *
 * Encodes the client's "NRG Master Prompt Template" (Sep 2026) as a repeatable
 * pipeline: the SCRIPT computes the exact distribution (domain × taxonomy ×
 * cluster) with largest-remainder rounding, then asks the model for small
 * batches with an explicit spec per item, validates the JSON it gets back,
 * dedups, and (optionally) inserts into Supabase as is_ai_generated=true,
 * is_active=false so a teacher must approve before students see anything.
 *
 * Works with any chat-completion API:
 *   --provider anthropic            ANTHROPIC_API_KEY            (default model claude-sonnet-4-5)
 *   --provider openai               OPENAI_API_KEY               (default gpt-4o)
 *   --provider gemini               GEMINI_API_KEY               (default gemini-2.0-flash)
 *   --provider ollama               OLLAMA_HOST (default http://localhost:11434), --model required
 *   --provider compatible           AI_BASE_URL + AI_API_KEY — any OpenAI-compatible endpoint
 *                                   (Groq, Together, OpenRouter, Mistral, DeepSeek, LM Studio…)
 *   --provider mock                 no network; fake items for testing the pipeline
 *
 * Usage:
 *   npx tsx scripts/generate-questions.ts --config docs/phase-1/generation-config.example.json --plan-only
 *   npx tsx scripts/generate-questions.ts --config gen.json --provider anthropic
 *   npx tsx scripts/generate-questions.ts --config gen.json --provider openai --model gpt-4o-mini --total 25
 *   npx tsx scripts/generate-questions.ts --config gen.json --provider anthropic --insert --env staging
 *
 * Flags override config: --total --title --audience --provider --model --batch --out
 *   --plan-only     print the distribution plan and exit (no API calls)
 *   --insert        write approved-pending rows to Supabase (needs --env)
 *   --env           staging | prod  (prod also needs CONFIRM_PROD=yes)
 *   --dedup-db      also reject stems that already exist in the target DB
 *   --max-calls N   safety cap on API requests
 *
 * Keys come from the environment / .env.local only. Never hardcode them.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ─── Fixed RENR references (from the client's template) ──────────────────────
const DOMAINS = [
  { code: "NP",   name: "Nursing Practice",                             pct: 30 },
  { code: "CDM",  name: "Clinical Decision Making and Intervention",    pct: 20 },
  { code: "NLM",  name: "Nursing Leadership and Management",            pct: 15 },
  { code: "PC",   name: "Professional Conduct",                         pct: 10 },
  { code: "HPMW", name: "Health Promotion and Maintenance of Wellness", pct: 10 },
  { code: "COM",  name: "Communication",                                pct: 10 },
  { code: "PD",   name: "Professional Development",                     pct: 5  },
];
const TAXONOMY = [
  { code: "AP",  name: "Application",                        pct: 50, db: "application" },
  { code: "ASE", name: "Analysis / Synthesis / Evaluation",  pct: 30, db: "analysis" },
  { code: "KC",  name: "Knowledge / Comprehension",          pct: 20, db: "knowledge" },
];
const CLUSTERS = [
  { code: "MEDSURG",  name: "Medical-surgical and community health priorities", pct: 30, examples: "cardiac, endocrine, renal, respiratory, infectious disease, trauma, cancer" },
  { code: "SAFETY",   name: "Safety, infection control, and core procedures",   pct: 22, examples: "PPE, medication safety, dosage calculation, IV therapy, oxygen, CPR, wound care" },
  { code: "MATCHILD", name: "Maternal-child and family nursing",                pct: 22, examples: "antenatal, obstetric emergencies, postpartum, newborn, growth and development, pediatrics" },
  { code: "MGMT",     name: "Management, legal, and professionalism",           pct: 14, examples: "nursing process, assessment, prioritization, delegation, ethics, legal practice" },
  { code: "PSYCHSOC", name: "Psychosocial and therapeutic communication",       pct: 12, examples: "therapeutic responses, psychosis, anxiety, substance use, family counselling, culture" },
];

// ─── Config (mirrors "Information to fill in before you generate") ───────────
type Config = {
  title: string;
  total: number;
  audience: string;
  topic_emphasis?: string;
  source_material?: string;        // inline text or a path to a .txt/.md file
  question_format?: string;        // "single-best-answer, scenario-based mix"
  domain_weights?: Record<string, number>;   // override, codes → pct
  taxonomy_weights?: Record<string, number>; // override
  cluster_weights?: Record<string, number>;  // override
  answer_key_style?: string;
  item_writing_rules?: string;     // inline or path
  difficulty_target?: string;
  exclusions?: string;
  allow_sata?: boolean;            // default false (single best answer only)
  options_per_item?: number;       // default 4
  provider?: Provider; model?: string; batch?: number; temperature?: number;
};
type Provider = "anthropic" | "openai" | "gemini" | "ollama" | "compatible" | "mock";

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const has  = (n: string) => args.includes(`--${n}`);

function loadDotEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnvLocal();

const cfgPath = flag("config");
const cfg: Config = cfgPath ? JSON.parse(readFileSync(resolve(cfgPath), "utf8")) : ({} as Config);
if (flag("total")) cfg.total = Number(flag("total"));
if (flag("title")) cfg.title = flag("title")!;
if (flag("audience")) cfg.audience = flag("audience")!;
cfg.provider = (flag("provider") ?? cfg.provider ?? "anthropic") as Provider;
cfg.model = flag("model") ?? cfg.model;
cfg.batch = Number(flag("batch") ?? cfg.batch ?? 5);
cfg.options_per_item ??= 4;
cfg.allow_sata ??= false;
cfg.temperature ??= 0.7;
if (!cfg.title || !cfg.total || !cfg.audience) { console.error("Need title, total and audience (config file or flags)."); process.exit(2); }

const PLAN_ONLY = has("plan-only");
const INSERT    = has("insert");
const DEDUP_DB  = has("dedup-db") || INSERT;
const ENV       = (flag("env") ?? "staging") as "staging" | "prod";
const MAX_CALLS = Number(flag("max-calls") ?? 200);
const RUN_ID    = new Date().toISOString().replace(/[:.]/g, "-");
const OUT       = flag("out") ?? `data/generated/${slug(cfg.title)}-${RUN_ID}.json`;

const maybeFile = (v?: string) => (v && existsSync(resolve(v)) ? readFileSync(resolve(v), "utf8") : v ?? "");
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }
const sha = (s: string) => createHash("sha256").update(s.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");

// ─── Distribution planner (largest-remainder rounding) ───────────────────────
function apportion(total: number, weights: { code: string; pct: number }[]): Record<string, number> {
  const sum = weights.reduce((a, w) => a + w.pct, 0);
  const raw = weights.map(w => ({ code: w.code, exact: (total * w.pct) / sum }));
  const out: Record<string, number> = {};
  let used = 0;
  for (const r of raw) { out[r.code] = Math.floor(r.exact); used += out[r.code]; }
  raw.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; used < total; i++, used++) out[raw[i % raw.length].code]++;
  return out;
}
function applyOverride<T extends { code: string; pct: number }>(base: T[], override?: Record<string, number>): T[] {
  if (!override) return base;
  const s = Object.values(override).reduce((a, b) => a + b, 0);
  if (Math.abs(s - 100) > 0.01) throw new Error(`override weights must sum to 100 (got ${s})`);
  return base.map(b => ({ ...b, pct: override[b.code] ?? 0 }));
}
// Deterministic interleave so each axis' totals are exact and the mix is spread evenly
function spread(counts: Record<string, number>): string[] {
  const out: string[] = [];
  const pool = Object.entries(counts).map(([code, n]) => ({ code, n, acc: 0 }));
  const total = pool.reduce((a, p) => a + p.n, 0);
  for (let i = 0; i < total; i++) {
    for (const p of pool) p.acc += p.n;
    const pick = pool.reduce((a, b) => (b.acc > a.acc ? b : a));
    pick.acc -= total; out.push(pick.code);
  }
  return out;
}
type Spec = { n: number; domain: string; taxonomy: string; cluster: string };
function buildPlan(total: number) {
  const dCounts = apportion(total, applyOverride(DOMAINS, cfg.domain_weights));
  const tCounts = apportion(total, applyOverride(TAXONOMY, cfg.taxonomy_weights));
  const cCounts = apportion(total, applyOverride(CLUSTERS, cfg.cluster_weights));
  const d = spread(dCounts), t = spread(tCounts), c = spread(cCounts);
  // rotate the secondary axes so the same domain doesn't always get the same taxonomy
  const rot = (arr: string[], k: number) => arr.slice(k).concat(arr.slice(0, k));
  const t2 = rot(t, Math.floor(total / 3)), c2 = rot(c, Math.floor(total / 2));
  const specs: Spec[] = d.map((domain, i) => ({ n: i + 1, domain, taxonomy: t2[i], cluster: c2[i] }));
  return { dCounts, tCounts, cCounts, specs };
}

// ─── Prompt (the master prompt, with the fields filled from config) ──────────
function systemPrompt(): string {
  const dw = applyOverride(DOMAINS, cfg.domain_weights), tw = applyOverride(TAXONOMY, cfg.taxonomy_weights), cw = applyOverride(CLUSTERS, cfg.cluster_weights);
  return `Act as an expert NRG nursing item writer and RENR-style examination designer (Registered Nurse examination, Trinidad & Tobago / Caribbean context).

You are generating items for: ${cfg.title}. Primary audience: ${cfg.audience}.

Official RENR domain weighting (for reference — the caller assigns each item's domain):
${dw.map(d => `- ${d.name} (${d.code}): ${d.pct}%`).join("\n")}

Official taxonomy weighting (the caller assigns each item's level):
${tw.map(t => `- ${t.name} (${t.code}): ${t.pct}%`).join("\n")}

High-yield topic clusters (the caller assigns each item's cluster):
${cw.map(c => `- ${c.name} (${c.code}) — ${c.examples}`).join("\n")}

Content priorities and source material:
${cfg.topic_emphasis ? `Topic emphasis: ${cfg.topic_emphasis}` : "Topic emphasis: none beyond the assigned cluster"}
${maybeFile(cfg.source_material) ? `Source material:\n${maybeFile(cfg.source_material)}` : "Source material: rely on current evidence-based nursing practice and standard nursing curricula."}

Question style: ${cfg.question_format ?? "single-best-answer multiple choice; mix of stand-alone and short clinical-scenario stems"}.
Difficulty target: ${cfg.difficulty_target ?? "exam-level mixed difficulty"}.
${cfg.allow_sata ? "Select-all-that-apply items are permitted only when the spec says so." : "Never write select-all-that-apply items: exactly one option is correct."}
Each item has exactly ${cfg.options_per_item} options.

NRG item-writing rules:
${maybeFile(cfg.item_writing_rules) || "- Stems are clinically realistic, complete, and answerable without the options.\n- One best answer; distractors are plausible, homogeneous in length and grammar, and represent common errors.\n- Use Caribbean/Trinidad & Tobago context, units and reference ranges where relevant.\n- No trick questions, no double negatives, no 'all of the above' / 'none of the above'."}

Exclusions: ${cfg.exclusions ?? "none"}.

For every item, internally ensure the domain tag and taxonomy tag match what the stem actually demands, the scenario is clinically realistic, only one answer is best, and distractors are plausible and level-appropriate.

OUTPUT: respond with a single JSON object and nothing else — no prose, no markdown fences. Schema:
{"items":[{"spec":<number from the request>,"stem":"...","options":[{"label":"A","text":"..."},...],"correct":["B"],"rationale_correct":"...","distractor_rationales":{"A":"...","C":"...","D":"..."},"topic":"short topic name","domain":"<code>","taxonomy":"<code>","cluster":"<code>","difficulty":"easy|medium|hard"}]}`;
}
function batchPrompt(specs: Spec[]): string {
  const lines = specs.map(s => {
    const d = DOMAINS.find(x => x.code === s.domain)!, t = TAXONOMY.find(x => x.code === s.taxonomy)!, c = CLUSTERS.find(x => x.code === s.cluster)!;
    return `- spec ${s.n}: domain ${d.code} (${d.name}); taxonomy ${t.code} (${t.name}); cluster ${c.code} (${c.name}: ${c.examples})`;
  });
  return `Write ${specs.length} items, one per spec, in the JSON schema from your instructions. Each item must use exactly the domain, taxonomy and cluster assigned to its spec. Vary the topics within each cluster; do not repeat a scenario.\n\n${lines.join("\n")}`;
}

// ─── Providers (plain fetch, no SDKs) ────────────────────────────────────────
type Chat = (system: string, user: string) => Promise<string>;
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing ${k} in env / .env.local`); return v; };

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const providers: Record<Provider, () => Chat> = {
  anthropic: () => {
    const key = need("ANTHROPIC_API_KEY"); const model = cfg.model ?? "claude-sonnet-4-5";
    return async (system, user) => {
      const r = await postJson("https://api.anthropic.com/v1/messages",
        { "x-api-key": key, "anthropic-version": "2023-06-01" },
        { model, max_tokens: 8000, temperature: cfg.temperature, system, messages: [{ role: "user", content: user }] });
      return r.content.map((c: any) => c.text ?? "").join("");
    };
  },
  openai: () => {
    const key = need("OPENAI_API_KEY"); const model = cfg.model ?? "gpt-4o";
    return openaiCompatible("https://api.openai.com/v1", key, model, true);
  },
  compatible: () => {
    const base = need("AI_BASE_URL").replace(/\/$/, ""); const key = process.env.AI_API_KEY ?? "";
    const model = cfg.model ?? need("AI_MODEL");
    return openaiCompatible(base, key, model, !has("no-json-mode"));
  },
  ollama: () => {
    const host = (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");
    const model = cfg.model ?? need("OLLAMA_MODEL");
    return async (system, user) => {
      const r = await postJson(`${host}/api/chat`, {}, { model, stream: false, format: "json", options: { temperature: cfg.temperature },
        messages: [{ role: "system", content: system }, { role: "user", content: user }] });
      return r.message.content;
    };
  },
  gemini: () => {
    const key = need("GEMINI_API_KEY"); const model = cfg.model ?? "gemini-2.0-flash";
    return async (system, user) => {
      const r = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {},
        { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: cfg.temperature, responseMimeType: "application/json" } });
      return r.candidates[0].content.parts.map((p: any) => p.text).join("");
    };
  },
  mock: () => async (_s, user) => {
    const specs = [...user.matchAll(/spec (\d+): domain (\w+).*?taxonomy (\w+).*?cluster (\w+)/g)];
    return JSON.stringify({ items: specs.map(m => ({
      spec: Number(m[1]), stem: `[MOCK ${m[1]}] A client in a ${m[4]} scenario requires ${m[3]}-level ${m[2]} judgement. Which action is best?`,
      options: [{ label: "A", text: "Option A" }, { label: "B", text: "Correct option" }, { label: "C", text: "Option C" }, { label: "D", text: "Option D" }],
      correct: ["B"], rationale_correct: "Mock rationale.", distractor_rationales: { A: "wrong", C: "wrong", D: "wrong" },
      topic: "Mock topic", domain: m[2], taxonomy: m[3], cluster: m[4], difficulty: "medium" })) });
  },
};
function openaiCompatible(base: string, key: string, model: string, jsonMode: boolean): Chat {
  return async (system, user) => {
    const body: any = { model, temperature: cfg.temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
    if (jsonMode) body.response_format = { type: "json_object" };
    const r = await postJson(`${base}/chat/completions`, key ? { authorization: `Bearer ${key}` } : {}, body);
    return r.choices[0].message.content;
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────
type Item = {
  spec: number; stem: string; options: { label: string; text: string }[]; correct: string[];
  rationale_correct: string; distractor_rationales: Record<string, string>; topic: string;
  domain: string; taxonomy: string; cluster: string; difficulty: "easy" | "medium" | "hard";
};
function extractJson(text: string): any {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no JSON object in response");
  return JSON.parse(t.slice(a, b + 1));
}
function validateItem(raw: any, spec: Spec): { ok: true; item: Item; warnings: string[] } | { ok: false; error: string } {
  const w: string[] = [];
  if (!raw || typeof raw.stem !== "string" || raw.stem.trim().length < 20) return { ok: false, error: "missing/short stem" };
  if (!Array.isArray(raw.options) || raw.options.length !== cfg.options_per_item) return { ok: false, error: `expected ${cfg.options_per_item} options` };
  const labels = raw.options.map((o: any) => String(o.label ?? "").toUpperCase());
  const expected = "ABCDEF".slice(0, cfg.options_per_item!).split("");
  if (labels.join("") !== expected.join("")) return { ok: false, error: `option labels ${labels.join("")} ≠ ${expected.join("")}` };
  if (raw.options.some((o: any) => !o.text || String(o.text).trim().length < 1)) return { ok: false, error: "blank option" };
  const correct: string[] = (Array.isArray(raw.correct) ? raw.correct : [raw.correct]).map((c: any) => String(c).toUpperCase());
  if (correct.some(c => !expected.includes(c))) return { ok: false, error: `correct ${correct} not in options` };
  if (!cfg.allow_sata && correct.length !== 1) return { ok: false, error: "must have exactly one correct option" };
  if (!raw.rationale_correct) return { ok: false, error: "missing rationale_correct" };
  const stemL = raw.stem.toLowerCase();
  if (/all of the above|none of the above/i.test(raw.options.map((o: any) => o.text).join(" "))) return { ok: false, error: "all/none of the above" };
  if (!cfg.allow_sata && /select all that apply/.test(stemL)) return { ok: false, error: "SATA stem when not allowed" };
  if (String(raw.domain).toUpperCase() !== spec.domain) w.push(`domain ${raw.domain}→${spec.domain}`);
  if (String(raw.taxonomy).toUpperCase() !== spec.taxonomy) w.push(`taxonomy ${raw.taxonomy}→${spec.taxonomy}`);
  if (String(raw.cluster).toUpperCase() !== spec.cluster) w.push(`cluster ${raw.cluster}→${spec.cluster}`);
  const difficulty = ["easy", "medium", "hard"].includes(String(raw.difficulty).toLowerCase()) ? String(raw.difficulty).toLowerCase() : "medium";
  return { ok: true, warnings: w, item: {
    spec: spec.n, stem: String(raw.stem).trim(), options: raw.options.map((o: any) => ({ label: String(o.label).toUpperCase(), text: String(o.text).trim() })),
    correct, rationale_correct: String(raw.rationale_correct).trim(),
    distractor_rationales: Object.fromEntries(Object.entries(raw.distractor_rationales ?? {}).map(([k, v]) => [k.toUpperCase(), String(v)])),
    topic: String(raw.topic ?? "").trim() || CLUSTERS.find(c => c.code === spec.cluster)!.name,
    domain: spec.domain, taxonomy: spec.taxonomy, cluster: spec.cluster, difficulty: difficulty as Item["difficulty"],
  } };
}

// ─── Supabase (only for --dedup-db / --insert) ───────────────────────────────
function supa() {
  const suffix = ENV === "staging" ? "_STAGING" : "";
  const url = process.env[`SUPABASE_URL${suffix}`] ?? process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`];
  const key = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`];
  if (!url || !key) throw new Error(`Missing SUPABASE_URL${suffix} / SUPABASE_SERVICE_ROLE_KEY${suffix}`);
  if (ENV === "prod" && INSERT && process.env.CONFIRM_PROD !== "yes") throw new Error("Refusing to insert into prod without CONFIRM_PROD=yes");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const plan = buildPlan(cfg.total);
  console.log(`\n${cfg.title} · ${cfg.total} items · provider=${cfg.provider} model=${cfg.model ?? "(default)"} · run ${RUN_ID}`);
  console.log("Distribution plan");
  console.log("  domains  :", Object.entries(plan.dCounts).map(([k, v]) => `${k}=${v}`).join("  "));
  console.log("  taxonomy :", Object.entries(plan.tCounts).map(([k, v]) => `${k}=${v}`).join("  "));
  console.log("  clusters :", Object.entries(plan.cCounts).map(([k, v]) => `${k}=${v}`).join("  "));
  if (PLAN_ONLY) return;

  const chat = providers[cfg.provider!]();
  const system = systemPrompt();
  const existing = new Set<string>();
  let db: ReturnType<typeof supa> | null = null;
  if (DEDUP_DB) {
    db = supa();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("questions").select("body").range(from, from + 999);
      if (error) throw error;
      data!.forEach(r => existing.add(sha(r.body)));
      if (data!.length < 1000) break;
    }
    console.log(`Loaded ${existing.size} existing stems from ${ENV} for dedup`);
  }

  const items: Item[] = []; const failures: { spec: number; error: string }[] = []; const warnings: string[] = [];
  let calls = 0; let queue = [...plan.specs];
  for (let attempt = 0; queue.length && attempt < 3; attempt++) {
    const retry: Spec[] = [];
    for (let i = 0; i < queue.length; i += cfg.batch!) {
      const batch = queue.slice(i, i + cfg.batch!);
      if (calls >= MAX_CALLS) { batch.forEach(s => failures.push({ spec: s.n, error: "max-calls reached" })); continue; }
      calls++;
      process.stdout.write(`  call ${calls}: specs ${batch.map(s => s.n).join(",")} … `);
      let raw: any;
      try { raw = extractJson(await chat(system, batchPrompt(batch))); }
      catch (e: any) { console.log(`✗ ${e.message}`); retry.push(...batch); continue; }
      const got = new Map<number, any>((raw.items ?? []).map((it: any) => [Number(it.spec), it]));
      let ok = 0;
      for (const spec of batch) {
        const v = validateItem(got.get(spec.n), spec);
        if (!v.ok) { retry.push(spec); continue; }
        const h = sha(v.item.stem);
        if (existing.has(h)) { retry.push(spec); warnings.push(`spec ${spec.n}: duplicate stem, regenerating`); continue; }
        existing.add(h); items.push(v.item); ok++;
        v.warnings.forEach(w => warnings.push(`spec ${spec.n}: model tagged ${w} (spec kept)`));
      }
      console.log(`${ok}/${batch.length} ok`);
    }
    queue = retry;
    if (queue.length) console.log(`  retrying ${queue.length} spec(s) (attempt ${attempt + 2})`);
  }
  queue.forEach(s => failures.push({ spec: s.n, error: "failed validation after 3 attempts" }));
  items.sort((a, b) => a.spec - b.spec);

  // ── Save JSON + Markdown review sheet ──
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  const outJson = { run_id: RUN_ID, config: { ...cfg }, plan: { domains: plan.dCounts, taxonomy: plan.tCounts, clusters: plan.cCounts }, api_calls: calls, items, failures, warnings };
  writeFileSync(resolve(OUT), JSON.stringify(outJson, null, 2));
  const md = [`# ${cfg.title}`, ``, `Generated ${RUN_ID} · ${cfg.provider}/${cfg.model ?? "default"} · ${items.length}/${cfg.total} items · status: PENDING TEACHER REVIEW`, ``,
    `Plan — domains: ${Object.entries(plan.dCounts).map(([k, v]) => `${k} ${v}`).join(", ")} · taxonomy: ${Object.entries(plan.tCounts).map(([k, v]) => `${k} ${v}`).join(", ")} · clusters: ${Object.entries(plan.cCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`, ``,
    ...items.flatMap(it => [`## ${it.spec}. [${it.domain} · ${it.taxonomy} · ${it.cluster} · ${it.difficulty}] ${it.topic}`, ``, it.stem, ``,
      ...it.options.map(o => `${o.label}. ${o.text}`), ``, `**Answer: ${it.correct.join(", ")}** — ${it.rationale_correct}`, ``,
      ...Object.entries(it.distractor_rationales).map(([k, v]) => `- ${k}: ${v}`), ``]),
    failures.length ? `## Failed specs\n${failures.map(f => `- ${f.spec}: ${f.error}`).join("\n")}` : ""];
  writeFileSync(resolve(OUT).replace(/\.json$/, ".md"), md.join("\n"));
  console.log(`\nSaved ${items.length} items → ${OUT} (+ .md review sheet) · ${calls} API calls · ${failures.length} failed · ${warnings.length} warnings`);
  warnings.slice(0, 10).forEach(w => console.log("  !", w));

  if (!INSERT) return;

  // ── Insert as pending review ──
  db ??= supa();
  const { data: domains } = await db.from("domains").select("id, code");
  const domainId = new Map((domains ?? []).map(d => [d.code as string, d.id as number]));
  const { data: clusters } = await db.from("topic_clusters").select("id, code");
  const clusterId = new Map((clusters ?? []).map(c => [c.code as string, c.id as number]));
  const { data: topics } = await db.from("topics").select("id, name");
  const topicId = new Map((topics ?? []).map(t => [String(t.name).toLowerCase(), t.id as number]));
  for (const it of items) {
    const k = it.topic.toLowerCase();
    if (topicId.has(k)) continue;
    const { data, error } = await db.from("topics").upsert({ name: it.topic, slug: `${it.cluster.toLowerCase()}-${slug(it.topic)}`, cluster_id: clusterId.get(it.cluster) ?? null, is_active: true }, { onConflict: "slug" }).select("id").single();
    if (!error && data) topicId.set(k, data.id);
  }
  const taxDb = Object.fromEntries(TAXONOMY.map(t => [t.code, t.db]));
  let inserted = 0;
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const rows = batch.map(it => ({
      source_id: `ai:${RUN_ID}:${it.spec}`, source: `ai:${cfg.provider}/${cfg.model ?? "default"}`,
      domain_id: domainId.get(it.domain)!, topic_id: topicId.get(it.topic.toLowerCase()) ?? null,
      body: it.stem, explanation: it.rationale_correct, cognitive_level: taxDb[it.taxonomy], difficulty: it.difficulty,
      question_type: it.correct.length > 1 ? "sata" : "mcq", is_ai_generated: true, is_active: false,
    }));
    const { data, error } = await db.from("questions").upsert(rows, { onConflict: "source_id" }).select("id, source_id");
    if (error) { console.error("insert failed:", error.message); continue; }
    const idBySource = new Map(data!.map(r => [r.source_id as string, r.id as string]));
    const opts = batch.flatMap(it => it.options.map((o, idx) => ({
      question_id: idBySource.get(`ai:${RUN_ID}:${it.spec}`)!, body: o.text, is_correct: it.correct.includes(o.label),
      rationale: it.correct.includes(o.label) ? it.rationale_correct : it.distractor_rationales[o.label] ?? null, display_order: idx + 1,
    })));
    const { error: oErr } = await db.from("question_options").insert(opts);
    if (oErr) console.error("options insert failed:", oErr.message); else inserted += batch.length;
  }
  console.log(`Inserted ${inserted} questions into ${ENV} as is_ai_generated=true, is_active=false (pending teacher approval).`);
}

main().catch(e => { console.error("\nFATAL:", e.message ?? e); process.exit(1); });
