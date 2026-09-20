/**
 * T28 — Question content migration (client files → Supabase)
 *
 * Usage:
 *   npx tsx scripts/migrate-questions.ts --file data/questions.csv --env staging --dry-run
 *   npx tsx scripts/migrate-questions.ts --file data/questions.xlsx --env staging
 *   npx tsx scripts/migrate-questions.ts --file data/questions.csv --env prod
 *
 * Flags:
 *   --file <path>        CSV or XLSX (XLSX needs `npm i -D xlsx`)
 *   --env staging|prod   picks SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or *_STAGING) from .env.local
 *   --dry-run            validate + resolve lookups, write nothing
 *   --limit <n>          only process the first n rows (smoke tests)
 *   --sheet <name>       XLSX sheet name (default: first sheet)
 *   --offline            parse + validate only, no Supabase connection (T25 audit helper)
 *   --author <name>      tags every migrated question with an "Author: <name>" tag
 *                         (default: "Jade Nicome" — the client). This is how
 *                         client-authored content stays distinguishable from the
 *                         AI-generated batch (source="ai_generated") after both
 *                         land in the same questions table. Pass a different
 *                         --author for a future contributor's file.
 *
 * Keys are read from the environment / .env.local — never hardcode them here.
 * Uses the service_role key (bypasses RLS). Never run against prod until the
 * staging run reports 0 errors (T29/T30).
 *
 * Column mapping lives in FIELD_MAP below and is finalised in T26 once the
 * client's files are audited (T25). Aliases are matched case-insensitively
 * after stripping non-alphanumerics, so "Question Text", "question_text" and
 * "QuestionText" all resolve to the same field.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";

// ─── Field mapping (T26 decides the final aliases) ───────────────────────────
const FIELD_MAP = {
  // "source_id" must be listed explicitly: aliases are matched after stripping
  // non-alphanumerics, so "source_id" normalises to "sourceid" and would not
  // otherwise match "id". Without it a CSV carrying a source_id column silently
  // fell back to hash: ids and lost its provenance.
  source_id:       ["source_id", "id", "question_id", "qid", "number", "no", "#"],
  domain:          ["domain", "category", "subject", "area"],
  topic:           ["topic", "subtopic", "sub_topic", "unit"],
  cluster:         ["cluster", "study_cluster", "clinical_area", "subject_area", "system", "specialty"],
  body:            ["question", "question_text", "stem", "body", "prompt"],
  explanation:     ["explanation", "rationale", "answer_explanation", "feedback"],
  cognitive_level: ["cognitive_level", "cognitive", "bloom", "blooms_level", "level"],
  difficulty:      ["difficulty", "diff"],
  question_type:   ["question_type", "type", "format"],
  correct:         ["answer", "correct_answer", "correct", "key", "answer_key"],
  option_a: ["option_a", "a", "optiona", "choice_a", "answer_a", "option1"],
  option_b: ["option_b", "b", "optionb", "choice_b", "answer_b", "option2"],
  option_c: ["option_c", "c", "optionc", "choice_c", "answer_c", "option3"],
  option_d: ["option_d", "d", "optiond", "choice_d", "answer_d", "option4"],
  option_e: ["option_e", "e", "optione", "choice_e", "answer_e", "option5"],
  option_f: ["option_f", "f", "optionf", "choice_f", "answer_f", "option6"],
  tags:            ["tags", "keywords"],
} as const;
type Field = keyof typeof FIELD_MAP;

// Values as they appear in the source → DB enum values (T26 finalises)
const COGNITIVE_MAP: Record<string, string> = {
  // RENR taxonomy codes (client template): KC / AP / ASE
  kc: "knowledge", "knowledge / comprehension": "knowledge", "knowledge/comprehension": "knowledge",
  ap: "application", ase: "analysis", "analysis / synthesis / evaluation": "analysis", "analysis/synthesis/evaluation": "analysis",
  knowledge: "knowledge", remember: "knowledge", recall: "knowledge",
  comprehension: "comprehension", understand: "comprehension", understanding: "comprehension",
  application: "application", apply: "application", applying: "application",
  analysis: "analysis", analyze: "analysis", analyse: "analysis", evaluation: "analysis", synthesis: "analysis",
};
const DIFFICULTY_MAP: Record<string, string> = {
  easy: "easy", low: "easy", "1": "easy",
  medium: "medium", moderate: "medium", average: "medium", "2": "medium",
  hard: "hard", difficult: "hard", high: "hard", "3": "hard",
};
// Official RENR domains (client template, Sep 2026) → domains.code
const DOMAIN_ALIASES: Record<string, string> = {
  np: "NP", "nursing practice": "NP",
  cdm: "CDM", "clinical decision making": "CDM", "clinical decision making and intervention": "CDM", "clinical decision-making": "CDM",
  nlm: "NLM", "nursing leadership and management": "NLM", "leadership and management": "NLM", "leadership & management": "NLM", management: "NLM", leadership: "NLM",
  pc: "PC", "professional conduct": "PC",
  hpmw: "HPMW", "health promotion and maintenance of wellness": "HPMW", "health promotion": "HPMW", wellness: "HPMW",
  com: "COM", communication: "COM",
  pd: "PD", "professional development": "PD",
};
// Clinical study clusters (the OTHER axis) → topic_clusters.code
const CLUSTER_ALIASES: Record<string, string> = {
  medsurg: "MEDSURG", "med-surg": "MEDSURG", "medical-surgical": "MEDSURG", "medical surgical": "MEDSURG", "medical-surgical nursing": "MEDSURG",
  "community health": "MEDSURG", community: "MEDSURG", "medical-surgical and community health priorities": "MEDSURG",
  cardiac: "MEDSURG", endocrine: "MEDSURG", renal: "MEDSURG", respiratory: "MEDSURG", "infectious disease": "MEDSURG", trauma: "MEDSURG", cancer: "MEDSURG", oncology: "MEDSURG",
  safety: "SAFETY", "infection control": "SAFETY", procedures: "SAFETY", fundamentals: "SAFETY", "fundamentals of nursing": "SAFETY", pharmacology: "SAFETY",
  "medication safety": "SAFETY", "dosage calculation": "SAFETY", "iv therapy": "SAFETY", "safety, infection control, and core procedures": "SAFETY",
  matchild: "MATCHILD", "maternal-child": "MATCHILD", "maternal child": "MATCHILD", maternal: "MATCHILD", obstetrics: "MATCHILD", midwifery: "MATCHILD",
  pediatrics: "MATCHILD", paediatrics: "MATCHILD", newborn: "MATCHILD", "maternal & child health": "MATCHILD", "maternal-child and family nursing": "MATCHILD",
  mgmt: "MGMT", legal: "MGMT", ethics: "MGMT", professionalism: "MGMT", "management, legal, and professionalism": "MGMT", "nursing process": "MGMT", delegation: "MGMT",
  psychsoc: "PSYCHSOC", psych: "PSYCHSOC", psychiatric: "PSYCHSOC", "mental health": "PSYCHSOC", psychosocial: "PSYCHSOC",
  "therapeutic communication": "PSYCHSOC", "psychosocial and therapeutic communication": "PSYCHSOC",

  // Additional first-segment categories seen in Jade's "Topic / Domain / Taxonomy" answer-key
  // format (T25 real-file audit, Sep 2026) — extends the buckets above rather than replacing them.
  "cardiac pharmacology": "MEDSURG", "chronic illness": "MEDSURG", gastrointestinal: "MEDSURG",
  genitourinary: "MEDSURG", hematology: "MEDSURG", hepatic: "MEDSURG", immunology: "MEDSURG",
  integumentary: "MEDSURG", musculoskeletal: "MEDSURG", neurological: "MEDSURG", neuromuscular: "MEDSURG",
  surgical: "MEDSURG", "preoperative care": "MEDSURG",
  "blood transfusion": "SAFETY", "burn care": "SAFETY", "disaster management": "SAFETY",
  "maternal and newborn": "MATCHILD", "adolescent health": "MATCHILD", "family support": "MATCHILD",
  "admission interview": "MGMT", assessment: "MGMT", "change management": "MGMT", "client rights": "MGMT",
  competence: "MGMT", confidentiality: "MGMT", "conflict resolution": "MGMT", "continuing education": "MGMT",
  documentation: "MGMT", "evidence-based practice": "MGMT", "human resource management": "MGMT",
  "management functions": "MGMT", privacy: "MGMT", "professional behaviour": "MGMT", "professional growth": "MGMT",
  "quality improvement": "MGMT", research: "MGMT", staffing: "MGMT", "time management": "MGMT",
  "end-of-life care": "MGMT", leadership: "MGMT", prioritization: "MGMT",
};

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const has  = (name: string) => args.includes(`--${name}`);

const FILE    = flag("file");
const ENV     = (flag("env") ?? "staging") as "staging" | "prod";
const DRY     = has("dry-run");
const LIMIT   = flag("limit") ? Number(flag("limit")) : Infinity;
const SHEET   = flag("sheet");
const OFFLINE = has("offline");
const AUTHOR  = flag("author") ?? "Jade Nicome";
const AUTHOR_TAG = `Author: ${AUTHOR}`;
const BATCH   = 100;
const RUN_ID  = new Date().toISOString().replace(/[:.]/g, "-");

if (!FILE) { console.error("--file <path> is required"); process.exit(2); }
if (!["staging", "prod"].includes(ENV)) { console.error("--env must be staging or prod"); process.exit(2); }

// ─── Env / client ────────────────────────────────────────────────────────────
function loadDotEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnvLocal();
const suffix = ENV === "staging" ? "_STAGING" : "";
const SUPABASE_URL = process.env[`SUPABASE_URL${suffix}`] ?? process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`];
const SERVICE_KEY  = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`];
if (!OFFLINE && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error(`Missing SUPABASE_URL${suffix} / SUPABASE_SERVICE_ROLE_KEY${suffix} in env or .env.local`);
  process.exit(2);
}
if (ENV === "prod" && !DRY && process.env.CONFIRM_PROD !== "yes") {
  console.error("Refusing to write to prod without CONFIRM_PROD=yes (run --dry-run first; see T31)");
  process.exit(2);
}
const db: SupabaseClient = createClient(SUPABASE_URL ?? "https://offline.invalid", SERVICE_KEY ?? "offline", { auth: { persistSession: false, autoRefreshToken: false } });

// ─── Source loading ──────────────────────────────────────────────────────────
type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  // RFC-4180-ish: quoted fields, doubled quotes, embedded newlines. UTF-8, BOM stripped.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter(r => r.some(v => v.trim() !== "")).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

async function loadRows(file: string): Promise<Row[]> {
  const ext = extname(file).toLowerCase();
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    let text = readFileSync(file, "utf8");
    if (ext === ".tsv") text = text.replace(/\t/g, ",");   // naive; use CSV export if tabs appear in cells
    return parseCsv(text);
  }
  if (ext === ".xlsx" || ext === ".xls") {
    let XLSX: any;
    try { XLSX = await import("xlsx" as string); } catch { throw new Error("XLSX input needs `npm i -D xlsx`"); }
    const wb = XLSX.read(readFileSync(file), { type: "buffer" });
    const ws = wb.Sheets[SHEET ?? wb.SheetNames[0]];
    if (!ws) throw new Error(`Sheet not found: ${SHEET}`);
    return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false }) as Row[];
  }
  if (ext === ".json") {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return (Array.isArray(data) ? data : data.questions ?? data.rows ?? []).map((r: any) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])));
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

// ─── Normalisation ───────────────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, "");
const clean = (s: unknown) => String(s ?? "").normalize("NFC").replace(/ /g, " ").trim();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function buildColumnIndex(header: string[]) {
  const idx: Partial<Record<Field, string>> = {};
  const byNorm = new Map(header.map(h => [norm(h), h]));
  for (const [field, aliases] of Object.entries(FIELD_MAP) as [Field, readonly string[]][]) {
    for (const a of aliases) { const h = byNorm.get(norm(a)); if (h) { idx[field] = h; break; } }
  }
  return idx;
}

type Parsed = {
  source_id: string; domain_key: string; cluster_key: string | null; topic: string | null; body: string; explanation: string | null;
  cognitive_level: string | null; difficulty: string | null; question_type: "mcq" | "sata";
  options: { body: string; is_correct: boolean; display_order: number }[]; tags: string[]; body_hash: string;
};

function parseRow(row: Row, col: Partial<Record<Field, string>>, rowNo: number): { ok: true; q: Parsed } | { ok: false; error: string } {
  const get = (f: Field) => (col[f] ? clean(row[col[f]!]) : "");
  const body = get("body");
  if (!body) return { ok: false, error: "blank question body" };

  const domainRaw = get("domain");
  if (!domainRaw) return { ok: false, error: "blank domain" };
  const domain_key = DOMAIN_ALIASES[domainRaw.toLowerCase()] ?? domainRaw.toUpperCase();
  const clusterRaw = get("cluster") || get("topic");
  const cluster_key = clusterRaw ? CLUSTER_ALIASES[clusterRaw.toLowerCase()] ?? null : null;

  const letters = ["a", "b", "c", "d", "e", "f"] as const;
  const optionBodies = letters.map(l => get(`option_${l}` as Field)).filter(Boolean);
  if (optionBodies.length < 2) return { ok: false, error: `only ${optionBodies.length} option(s) found` };

  const correctRaw = get("correct");
  if (!correctRaw) return { ok: false, error: "blank correct answer" };
  // Accept "B", "b", "B, D", "BD", "2", "Option B", or the full option text
  const correctSet = new Set<number>();
  const tokens = correctRaw.split(/[,;/ &+]+/).map(t => t.replace(/^option\s*/i, "").trim()).filter(Boolean);
  for (const t of tokens) {
    if (/^[a-fA-F]{1,6}$/.test(t)) { for (const ch of t.toLowerCase()) correctSet.add(letters.indexOf(ch as any)); }
    else if (/^[1-6]$/.test(t)) correctSet.add(Number(t) - 1);
    else { const i = optionBodies.findIndex(o => o.toLowerCase() === t.toLowerCase()); if (i >= 0) correctSet.add(i); }
  }
  correctSet.delete(-1);
  if (correctSet.size === 0) return { ok: false, error: `could not resolve correct answer "${correctRaw}"` };
  if ([...correctSet].some(i => i >= optionBodies.length)) return { ok: false, error: `correct answer "${correctRaw}" points past the last option` };

  const typeRaw = get("question_type").toLowerCase();
  const isSata = /sata|select\s*all|multiple\s*response/.test(typeRaw) || /select\s+all\s+that\s+apply/i.test(body) || correctSet.size > 1;
  if (!isSata && correctSet.size !== 1) return { ok: false, error: "mcq with multiple correct answers" };

  const cog = get("cognitive_level").toLowerCase();
  const dif = get("difficulty").toLowerCase();
  const cognitive_level = cog ? COGNITIVE_MAP[cog] ?? null : null;
  const difficulty = dif ? DIFFICULTY_MAP[dif] ?? null : null;
  if (cog && !cognitive_level) return { ok: false, error: `unknown cognitive_level "${cog}"` };
  if (dif && !difficulty) return { ok: false, error: `unknown difficulty "${dif}"` };

  const body_hash = sha(body.toLowerCase().replace(/\s+/g, " "));
  const source_id = get("source_id") || `hash:${body_hash.slice(0, 24)}`;

  return { ok: true, q: {
    source_id, domain_key, cluster_key, topic: get("topic") || null, body,
    explanation: get("explanation") || null, cognitive_level, difficulty,
    question_type: isSata ? "sata" : "mcq",
    options: optionBodies.map((b, i) => ({ body: b, is_correct: correctSet.has(i), display_order: i + 1 })),
    tags: get("tags").split(/[,;|]/).map(t => clean(t)).filter(Boolean),
    body_hash,
  } };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nNRG question migration · env=${ENV} · ${DRY ? "DRY RUN" : "WRITE"} · run_id=${RUN_ID}`);
  const file = resolve(FILE!);
  const rows = (await loadRows(file)).slice(0, LIMIT);
  if (rows.length === 0) throw new Error("no rows found");
  const header = Object.keys(rows[0]);
  const col = buildColumnIndex(header);
  console.log(`Loaded ${rows.length} rows from ${file}`);
  console.log(`Tagging every row "${AUTHOR_TAG}" (--author to change)`);
  console.log("Column mapping:", Object.entries(col).map(([f, h]) => `${f}←"${h}"`).join("  "));
  const missing = (["body", "domain", "correct", "option_a", "option_b"] as Field[]).filter(f => !col[f]);
  if (missing.length) throw new Error(`Required columns not found: ${missing.join(", ")} — update FIELD_MAP (T26)`);

  const topicKey = (_domainId: number, name: string) => name.toLowerCase();
  const KNOWN_CODES = new Set(Object.values(DOMAIN_ALIASES));

  const log: { run_id: string; source_id: string | null; status: "success" | "error" | "skipped"; message: string | null }[] = [];
  const seenHash = new Map<string, string>();
  const seenId = new Set<string>();
  const parsed: Parsed[] = [];
  const counts = { success: 0, error: 0, skipped: 0 };
  const byDomain = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const r = parseRow(rows[i], col, i + 2);
    const sid = r.ok ? r.q.source_id : (col.source_id ? clean(rows[i][col.source_id]) : null) || `row:${i + 2}`;
    if (!r.ok) { counts.error++; log.push({ run_id: RUN_ID, source_id: sid, status: "error", message: `row ${i + 2}: ${r.error}` }); continue; }
    if (!KNOWN_CODES.has(r.q.domain_key)) { counts.error++; log.push({ run_id: RUN_ID, source_id: sid, status: "error", message: `row ${i + 2}: unknown domain "${rows[i][col.domain!]}" (add to DOMAIN_ALIASES)` }); continue; }
    if (seenId.has(r.q.source_id)) { counts.skipped++; log.push({ run_id: RUN_ID, source_id: sid, status: "skipped", message: `row ${i + 2}: duplicate source_id` }); continue; }
    if (seenHash.has(r.q.body_hash)) { counts.skipped++; log.push({ run_id: RUN_ID, source_id: sid, status: "skipped", message: `row ${i + 2}: duplicate of ${seenHash.get(r.q.body_hash)}` }); continue; }
    seenId.add(r.q.source_id); seenHash.set(r.q.body_hash, r.q.source_id);
    byDomain.set(r.q.domain_key, (byDomain.get(r.q.domain_key) ?? 0) + 1);
    if (!r.q.tags.includes(AUTHOR_TAG)) r.q.tags.push(AUTHOR_TAG);
    parsed.push(r.q);
  }

  console.log(`\nValidation: ${parsed.length} ok · ${counts.error} errors · ${counts.skipped} skipped`);
  console.log("By domain:", [...byDomain.entries()].map(([k, v]) => `${k}=${v}`).join("  "));
  console.log(`Types: mcq=${parsed.filter(q => q.question_type === "mcq").length} sata=${parsed.filter(q => q.question_type === "sata").length}`);
  console.log(`Missing explanation: ${parsed.filter(q => !q.explanation).length} · distinct topics: ${new Set(parsed.filter(q => q.topic).map(q => `${q.domain_key}:${q.topic}`)).size}`);
  if (counts.error) {
    console.log("\nFirst errors:");
    log.filter(l => l.status === "error").slice(0, 15).forEach(l => console.log("  ✗", l.message));
  }

  if (OFFLINE) { console.log("\nOffline validation complete — no database contacted."); process.exit(counts.error ? 1 : 0); }

  // Lookups (needs the DB)
  const { data: domains, error: dErr } = await db.from("domains").select("id, code, name");
  if (dErr) throw dErr;
  const domainByCode = new Map(domains!.map(d => [d.code.toUpperCase(), d.id as number]));
  const { data: topics, error: tErr } = await db.from("topics").select("id, domain_id, name, slug");
  const { data: clusters } = await db.from("topic_clusters").select("id, code");
  const clusterByCode = new Map((clusters ?? []).map(c => [c.code as string, c.id as number]));
  if (tErr) throw tErr;
  const topicByKey = new Map(topics!.map(t => [topicKey(t.domain_id ?? 0, t.name), t.id as number]));
  const missingInDb = [...byDomain.keys()].filter(k => !domainByCode.has(k));
  if (missingInDb.length) throw new Error(`domains not seeded in ${ENV}: ${missingInDb.join(", ")} (run T13 migration)`);
  const newTopics = new Set(parsed.filter(q => q.topic && !topicByKey.has(topicKey(domainByCode.get(q.domain_key)!, q.topic!))).map(q => `${q.domain_key}:${q.topic}`)).size;
  console.log(`DB check ok · new topics to create: ${newTopics}`);

  if (DRY) { console.log("\nDry run complete — nothing written."); process.exit(counts.error ? 1 : 0); }

  // ── Write ──
  // Topics first (insert missing)
  for (const q of parsed) {
    if (!q.topic) continue;
    const domainId = domainByCode.get(q.domain_key)!;
    const k = topicKey(domainId, q.topic);
    if (topicByKey.has(k)) continue;
    const slug = `${(q.cluster_key ?? "topic").toLowerCase()}-${slugify(q.topic)}`;
    const cluster_id = q.cluster_key ? clusterByCode.get(q.cluster_key) ?? null : null;
    const { data, error } = await db.from("topics").upsert({ cluster_id, name: q.topic, slug, is_active: true }, { onConflict: "slug" }).select("id").single();
    if (error) throw new Error(`topic insert failed for "${q.topic}": ${error.message}`);
    topicByKey.set(k, data!.id);
  }

  for (let start = 0; start < parsed.length; start += BATCH) {
    const batch = parsed.slice(start, start + BATCH);
    const rowsToUpsert = batch.map(q => ({
      source_id: q.source_id,
      domain_id: domainByCode.get(q.domain_key)!,
      topic_id: q.topic ? topicByKey.get(topicKey(domainByCode.get(q.domain_key)!, q.topic)) ?? null : null,
      body: q.body, explanation: q.explanation,
      cognitive_level: q.cognitive_level, difficulty: q.difficulty,
      question_type: q.question_type, source: "client-import", is_ai_generated: false, is_active: true,
    }));
    const { data: inserted, error } = await db.from("questions").upsert(rowsToUpsert, { onConflict: "source_id" }).select("id, source_id");
    if (error) {
      counts.error += batch.length;
      batch.forEach(q => log.push({ run_id: RUN_ID, source_id: q.source_id, status: "error", message: `batch upsert: ${error.message}` }));
      continue;
    }
    const idBySource = new Map(inserted!.map(r => [r.source_id as string, r.id as string]));
    const qids = [...idBySource.values()];
    // Replace options wholesale so reruns stay idempotent
    const { error: delErr } = await db.from("question_options").delete().in("question_id", qids);
    if (delErr) throw delErr;
    const opts = batch.flatMap(q => q.options.map(o => ({ ...o, question_id: idBySource.get(q.source_id)! })));
    const { error: optErr } = await db.from("question_options").insert(opts);
    if (optErr) {
      counts.error += batch.length;
      batch.forEach(q => log.push({ run_id: RUN_ID, source_id: q.source_id, status: "error", message: `options insert: ${optErr.message}` }));
      continue;
    }
    // Tags (best effort)
    const tagNames = [...new Set(batch.flatMap(q => q.tags))];
    if (tagNames.length) {
      await db.from("tags").upsert(tagNames.map(name => ({ name })), { onConflict: "name", ignoreDuplicates: true });
      const { data: tagRows } = await db.from("tags").select("id, name").in("name", tagNames);
      const tagId = new Map((tagRows ?? []).map(t => [t.name as string, t.id as number]));
      const links = batch.flatMap(q => q.tags.filter(t => tagId.has(t)).map(t => ({ question_id: idBySource.get(q.source_id)!, tag_id: tagId.get(t)! })));
      if (links.length) await db.from("question_tags").upsert(links, { onConflict: "question_id,tag_id", ignoreDuplicates: true });
    }
    counts.success += batch.length;
    batch.forEach(q => log.push({ run_id: RUN_ID, source_id: q.source_id, status: "success", message: null }));
    process.stdout.write(`  upserted ${Math.min(start + BATCH, parsed.length)}/${parsed.length}\r`);
  }

  for (let s = 0; s < log.length; s += 500) {
    const { error } = await db.from("migration_log").insert(log.slice(s, s + 500));
    if (error) console.error("migration_log insert failed:", error.message);
  }

  console.log(`\n\nDone. success=${counts.success} error=${counts.error} skipped=${counts.skipped}`);
  console.log(`Check: SELECT status, count(*) FROM public.migration_log WHERE run_id='${RUN_ID}' GROUP BY status;`);
  process.exit(counts.error ? 1 : 0);
}

main().catch(e => { console.error("\nFATAL:", e.message ?? e); process.exit(1); });
