// T33 — Sample QA: pull a random sample of Jade's migrated questions from Supabase and
// print each next to its source CSV row, with automatic field-by-field diff flags.
//
//   node scripts/qa-sample.mjs                       # 20 random, staging, markdown to stdout
//   node scripts/qa-sample.mjs --seed 42 --out qa.md # reproducible sample, write a checklist file
//   node scripts/qa-sample.mjs --count 100           # everything
//   node scripts/qa-sample.mjs --env prod            # read-only, but needs Ian's go-ahead per CLAUDE.md
//
// READ-ONLY: only issues GET requests. Keys come from .env.local (never hardcoded).
// Scope note: the CSV was itself parsed from Jade's docx, so a clean DB-vs-CSV diff proves
// the migration was faithful, NOT that the docx→CSV transcription was. The human still has
// to read each block against `NRG RENR Sample Questions #1.docx` / `Sample Answers #1.docx`.
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ENV = flag("env", "staging");
const COUNT = Number(flag("count", 20));
const CSV_PATH = flag("csv", new URL("./data/jade-nrg-sample-1.csv", import.meta.url).pathname);
const OUT = flag("out");
const SEED = Number(flag("seed", Math.floor(Math.random() * 2 ** 31)));
const PREFIX = "jade:nrg-sample-1:";
const AUTHOR_TAG = "Author: Jade Nicome";
if (!["staging", "prod"].includes(ENV)) { console.error("--env must be staging or prod"); process.exit(2); }

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sfx = ENV === "staging" ? "_STAGING" : "";
const SB = env[`NEXT_PUBLIC_SUPABASE_URL${sfx}`];
const KEY = env[`SUPABASE_SERVICE_ROLE_KEY${sfx}`];
if (!SB || !KEY) { console.error(`Missing NEXT_PUBLIC_SUPABASE_URL${sfx} / SUPABASE_SERVICE_ROLE_KEY${sfx} in .env.local`); process.exit(2); }

// ── CSV (same RFC-4180 handling as migrate-questions.ts) ────────────────────────
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.some((v) => v.trim() !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
// Mirrors migrate-questions.ts clean(): NFC + nbsp→space + trim
const clean = (s) => String(s ?? "").normalize("NFC").replace(/ /g, " ").trim();
const squash = (s) => clean(s).replace(/\s+/g, " ");
const qNum = (sid) => Number(sid.split(":").pop().replace(/\D/g, "")) || 0;

const csvRows = new Map(parseCsv(readFileSync(CSV_PATH, "utf8")).map((r) => [clean(r.source_id), r]));

// ── Supabase (GET only) ─────────────────────────────────────────────────────────
const select = "id,source_id,body,explanation,cognitive_level,question_type,is_active,is_ai_generated," +
  "domains(code,name),topics(name),question_options(body,is_correct,display_order),question_tags(tags(name))";
const url = `${SB}/rest/v1/questions?select=${encodeURIComponent(select)}&source_id=like.${encodeURIComponent(PREFIX + "*")}&order=source_id`;
let dbRows;
try {
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  dbRows = await res.json();
} catch (e) {
  console.error(`Could not read ${ENV} (${SB}): ${e.message}${e.cause ? ` — ${e.cause.code ?? e.cause.message}` : ""}`);
  console.error("If this is a network/proxy block, run the script from a shell that can reach *.supabase.co.");
  process.exit(1);
}
const dbBy = new Map(dbRows.map((r) => [r.source_id, r]));

// ── Population check (cheap, covers all 100, not just the sample) ───────────────
const onlyCsv = [...csvRows.keys()].filter((k) => !dbBy.has(k));
const onlyDb = [...dbBy.keys()].filter((k) => !csvRows.has(k));

// ── Seeded sample ───────────────────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(SEED);
const pool = [...dbBy.keys()].filter((k) => csvRows.has(k));
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const sample = pool.slice(0, Math.min(COUNT, pool.length)).sort((a, b) => qNum(a) - qNum(b));

// ── Compare + render ────────────────────────────────────────────────────────────
const LETTERS = "ABCDEF";
const COG = { kc: "knowledge", ap: "application", ase: "analysis" };
let totalFlags = 0;
const out = [];
const w = (s = "") => out.push(s);

function cmp(label, csvVal, dbVal, flags) {
  const a = clean(csvVal), b = clean(dbVal);
  if (a === b) return "✅";
  const ws = squash(a) === squash(b);
  flags.push(`${label}${ws ? " (whitespace only)" : ""}`);
  return ws ? "⚠️ whitespace differs" : "❌ DIFFERS";
}

w(`# T33 sample QA — ${sample.length} of ${pool.length} questions`);
w();
w(`- env: **${ENV}** · seed: **${SEED}** (re-run with \`--seed ${SEED}\` for the same sample) · generated ${new Date().toISOString()}`);
w(`- population: ${dbRows.length} Jade rows in DB · ${csvRows.size} in CSV · only-in-CSV: ${onlyCsv.length ? onlyCsv.join(", ") : "none"} · only-in-DB: ${onlyDb.length ? onlyDb.join(", ") : "none"}`);
w(`- ✅/❌ below compare **DB vs. CSV** only. You still need to check each block against the original docx (questions + answers files) for transcription accuracy.`);
w();

for (const sid of sample) {
  const c = csvRows.get(sid), d = dbRows.find((r) => r.source_id === sid);
  const flags = [];
  const opts = [...d.question_options].sort((x, y) => x.display_order - y.display_order);
  const csvOpts = ["option_a", "option_b", "option_c", "option_d", "option_e", "option_f"].map((k) => clean(c[k])).filter(Boolean);
  const csvCorrect = new Set(clean(c.correct).toUpperCase().split(/[^A-F]+/).join("").split(""));
  const dbCorrect = new Set(opts.map((o, i) => (o.is_correct ? LETTERS[i] : null)).filter(Boolean));

  w(`## ${sid.replace(PREFIX, "")}  ·  \`${sid}\``);
  w();
  w(`- [ ] verified against docx`);
  w();
  const bodyMark = cmp("question", c.question, d.body, flags);
  const expMark = cmp("explanation", c.explanation, d.explanation, flags);
  w(`**Question** ${bodyMark}`);
  w(`- CSV: ${clean(c.question)}`);
  if (bodyMark !== "✅") w(`- DB:  ${clean(d.body)}`);
  w();
  w(`**Options**`);
  const n = Math.max(csvOpts.length, opts.length);
  if (csvOpts.length !== opts.length) flags.push(`option count (CSV ${csvOpts.length} vs DB ${opts.length})`);
  for (let i = 0; i < n; i++) {
    const mark = cmp(`option ${LETTERS[i]}`, csvOpts[i], opts[i]?.body, flags);
    const star = csvCorrect.has(LETTERS[i]) ? " **(correct per CSV)**" : "";
    w(`- ${LETTERS[i]}. ${mark} ${clean(csvOpts[i])}${star}`);
    if (mark !== "✅") w(`  - DB: ${clean(opts[i]?.body)}`);
  }
  const keyOk = [...csvCorrect].sort().join() === [...dbCorrect].sort().join();
  if (!keyOk) flags.push("correct-answer key");
  w();
  w(`**Answer key** ${keyOk ? "✅" : "❌ DIFFERS"} — CSV: ${[...csvCorrect].sort().join(", ")} · DB: ${[...dbCorrect].sort().join(", ")}`);
  w();
  w(`**Explanation** ${expMark}`);
  w(`- CSV: ${clean(c.explanation)}`);
  if (expMark !== "✅") w(`- DB:  ${clean(d.explanation)}`);
  w();
  const wantCog = COG[clean(c.cognitive_level).toLowerCase()] ?? clean(c.cognitive_level).toLowerCase();
  const cogOk = wantCog === d.cognitive_level;
  if (!cogOk) flags.push("cognitive_level");
  const tags = (d.question_tags ?? []).map((t) => t.tags?.name).filter(Boolean);
  if (!tags.includes(AUTHOR_TAG)) flags.push(`missing tag "${AUTHOR_TAG}"`);
  if (d.is_ai_generated) flags.push("is_ai_generated=true on a Jade row");
  if (!d.is_active) flags.push("is_active=false on a Jade row");
  w(`**Metadata** (eyeball domain/topic against the docx)`);
  w(`- domain: CSV "${clean(c.domain)}" → DB ${d.domains?.name ?? "∅"} (${d.domains?.code ?? "∅"})`);
  w(`- topic: CSV "${clean(c.topic)}" → DB ${d.topics?.name ?? "∅"}`);
  w(`- cognitive level: CSV ${clean(c.cognitive_level)} → DB ${d.cognitive_level ?? "∅"} ${cogOk ? "✅" : "❌"}`);
  w(`- type: ${d.question_type} · active: ${d.is_active} · ai-generated: ${d.is_ai_generated} · tags: ${tags.join(", ") || "none"}`);
  w();
  w(flags.length ? `> **Auto-flags: ${flags.join("; ")}**` : `> Auto-check: no DB-vs-CSV differences`);
  w();
  totalFlags += flags.length;
}

w(`---`);
w(`**Summary:** ${sample.length} questions sampled · ${totalFlags} DB-vs-CSV auto-flags · ${onlyCsv.length + onlyDb.length} population mismatches.`);

const text = out.join("\n") + "\n";
if (OUT) { writeFileSync(OUT, text); console.error(`Wrote ${OUT} (${sample.length} questions, ${totalFlags} auto-flags)`); }
else process.stdout.write(text);
process.exit(totalFlags || onlyCsv.length || onlyDb.length ? 1 : 0);
