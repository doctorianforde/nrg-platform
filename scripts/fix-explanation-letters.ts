/**
 * Repair option-letter references in the prototype bank's explanations.
 *
 *   npx tsx scripts/fix-explanation-letters.ts --env staging --dry-run
 *   npx tsx scripts/fix-explanation-letters.ts --env staging
 *   npx tsx scripts/fix-explanation-letters.ts --env staging --csv   # also rewrite the CSV
 *
 * WHY THIS EXISTS
 * The audit shuffled option order to remove a paste-order bias where ~91% of correct
 * answers sat in slots A–B. That was the right fix, but 808 explanations refer to
 * options by their ORIGINAL letter — "dry mucous membranes (A), thirst (C)" — so
 * after the shuffle those letters point at the wrong options and the prose argues
 * against the wrong distractors. Worse than cosmetic: a student is misinformed, and
 * a reviewer may reject a sound question because its explanation reads incoherently.
 *
 * HOW THE MAPPING IS RECOVERED
 * Not from the shuffle's RNG seed. For each question the ORIGINAL option order is
 * read back from the prototype source and matched to the stored order BY TEXT, which
 * yields old-letter → new-letter directly. Text matching is self-verifying: if a
 * single option fails to match, the row is skipped rather than guessed at.
 *
 * WHICH PATTERNS ARE TOUCHED, AND WHY NOT MORE
 * Only forms that cannot mean anything else:
 *     (A)        parenthesised single letter
 *     option A / answer A / choice A
 * Deliberately NOT rewritten, because the corpus proves them unsafe:
 *     "A)"  — matches "fever >=38 C)" and "with vitamin C)", 784 rows, mostly noise
 *     "A."  — all 16 occurrences are "C. difficile", "Plan B.", "inhibin A."
 * Both are reported instead, for a human to look at.
 *
 * Rewriting is a single simultaneous pass. A sequential one would corrupt any swap:
 * A→C followed by C→A would undo itself.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (n: string) => args.includes(`--${n}`);

const ENV = (flag("env") ?? "staging") as "staging" | "prod";
const DRY = has("dry-run");
const WRITE_CSV = has("csv");
const SOURCE_TAG = flag("source") ?? "prototype-import";
const PROTO = "OKComputer_NRG_Website/app/src/data";
const CSV = "scripts/data/proto-import-clean.csv";

if (!["staging", "prod"].includes(ENV)) { console.error("--env must be staging or prod"); process.exit(2); }
if (ENV === "prod" && !DRY && process.env.CONFIRM_PROD !== "yes") {
  console.error("Refusing to write to prod without CONFIRM_PROD=yes");
  process.exit(2);
}

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const sfx = ENV === "staging" ? "_STAGING" : "";
const URL = process.env[`NEXT_PUBLIC_SUPABASE_URL${sfx}`] ?? process.env[`SUPABASE_URL${sfx}`];
const KEY = process.env[`SUPABASE_SERVICE_ROLE_KEY${sfx}`];
if (!URL || !KEY) { console.error(`Missing Supabase URL / service key for ${ENV}`); process.exit(2); }
const db: SupabaseClient = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ── Normalising, shared by every comparison ─────────────────────────────────
/** The prototype stores escapes literally (\u2014, \n). The database holds the
 *  decoded characters, so every comparison has to decode first — skipping this is
 *  what originally caused 37 rows to look like "stem not found in source". */
const decode = (s: string) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
   .replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\"/g, '"').replace(/\\'/g, "'");
const flat = (s: string) => decode(s).replace(/\s+/g, " ").trim();
const norm = (s: string) =>
  flat(s).replace(/[""]/g, '"').replace(/['']/g, "'").toLowerCase();
const stripLabel = (s: string) => s.replace(/^\s*[A-Fa-f][.)]\s+/, "").trim();

// ── Read the prototype's ORIGINAL option order ──────────────────────────────
/** Top-level {...} blocks, string-aware so braces inside prose don't fool it. */
function objectBlocks(src: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, q: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && start >= 0) { out.push(src.slice(start, i + 1)); start = -1; } }
  }
  return out;
}
function quotedStrings(seg: string): string[] {
  const out: string[] = [];
  const re = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) out.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  return out;
}

/** normalised stem → the prototype's own option order and rationale */
const original = new Map<string, { options: string[]; rationale: string }>();
for (const file of readdirSync(PROTO).filter((f) => f.endsWith(".ts"))) {
  const text = readFileSync(resolve(PROTO, file), "utf8");
  for (const block of objectBlocks(text)) {
    const stemM = block.match(/["']?(?:stem|question)["']?\s*:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/);
    const optsM = block.match(/["']?options["']?\s*:\s*\[([\s\S]*?)\]/);
    const ratM = block.match(/["']?rationale["']?\s*:\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/);
    if (!stemM || !optsM || !ratM) continue;
    const options = quotedStrings(optsM[1]).map((o) => stripLabel(decode(o))).filter(Boolean);
    if (options.length < 2) continue;
    const key = norm(stemM[2]);
    if (!original.has(key)) original.set(key, { options, rationale: ratM[2] });
  }
}
console.log(`prototype source: ${original.size} unique stems with option order`);

// ── The only patterns safe to rewrite ───────────────────────────────────────
const SAFE_PATTERNS: RegExp[] = [
  /\(\s*([A-D])\s*\)/g,
  /\b(option)\s+([A-D])\b/gi,
  /\b(answer)\s+([A-D])\b/gi,
  /\b(choice)\s+([A-D])\b/gi,
];
const UNSAFE_REPORT: [string, RegExp][] = [
  ["letter+close-paren e.g. 'A)'", /(^|[\s,;])[A-D]\)/],
  ["bare letter+period e.g. 'A.'", /(^|[\s;])[A-D]\.\s/],
];

/** Rewrite every safe reference in one pass, so swaps cannot undo each other. */
function remap(text: string, map: Map<string, string>): { out: string; changed: number } {
  let changed = 0;
  let out = text.replace(/\(\s*([A-D])\s*\)/g, (whole, L: string) => {
    const to = map.get(L);
    if (!to || to === L) return whole;
    changed++;
    return `(${to})`;
  });
  out = out.replace(/\b(option|answer|choice)(\s+)([A-D])\b/gi, (whole, word: string, gap: string, L: string) => {
    const to = map.get(L.toUpperCase());
    if (!to || to === L.toUpperCase()) return whole;
    changed++;
    return `${word}${gap}${to}`;
  });
  return { out, changed };
}

type Row = {
  id: string;
  source_id: string;
  body: string;
  explanation: string | null;
  question_options: { body: string; display_order: number }[];
};

async function fetchRows(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("questions")
      .select("id, source_id, body, explanation, question_options(body, display_order)")
      .eq("source", SOURCE_TAG)
      .order("source_id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
const rows = await fetchRows();
console.log(`${ENV}: ${rows.length} rows tagged source="${SOURCE_TAG}"`);

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const planned: { row: Row; before: string; after: string; changed: number; map: string }[] = [];
let noRefs = 0, noSource = 0, unmatchedOption = 0, identityMap = 0;
const drifted: string[] = [];
const unsafeOnly = new Set<string>();

for (const row of rows) {
  const explanation = row.explanation ?? "";
  const hasSafe = SAFE_PATTERNS.some((re) => new RegExp(re.source, re.flags).test(explanation));
  if (!hasSafe) {
    if (UNSAFE_REPORT.some(([, re]) => re.test(explanation))) unsafeOnly.add(row.source_id);
    noRefs++;
    continue;
  }

  const orig = original.get(norm(row.body));
  if (!orig) { noSource++; continue; }

  const current = [...row.question_options].sort((a, b) => a.display_order - b.display_order).map((o) => o.body);
  // old letter → new letter, derived purely by matching option text.
  const map = new Map<string, string>();
  let ok = true;
  for (let i = 0; i < orig.options.length && i < LETTERS.length; i++) {
    const j = current.findIndex((c) => norm(c) === norm(orig.options[i]));
    if (j < 0) { ok = false; break; }
    map.set(LETTERS[i], LETTERS[j]);
  }
  if (!ok) { unmatchedOption++; continue; }

  // The target text is derived from the IMMUTABLE source rationale, never from the
  // stored value. That makes the script idempotent: transforming what is already
  // stored would shift the letters a second time on a re-run.
  const target = remap(flat(orig.rationale), map).out;
  const stored = flat(explanation);

  if (stored === target) { identityMap++; continue; }          // already correct
  if (stored !== flat(orig.rationale)) { drifted.push(row.source_id); continue; } // hand-edited since import

  planned.push({
    row, before: explanation, after: target,
    changed: remap(flat(orig.rationale), map).changed,
    map: [...map.entries()].filter(([a, b]) => a !== b).map(([a, b]) => `${a}→${b}`).join(" "),
  });
}

console.log(`\nrows with a safely-rewritable reference : ${planned.length + unmatchedOption + noSource + identityMap}`);
console.log(`  will rewrite                         : ${planned.length}  (${planned.reduce((n, p) => n + p.changed, 0)} references)`);
console.log(`  skipped, stem not found in source    : ${noSource}`);
console.log(`  skipped, an option text didn't match  : ${unmatchedOption}`);
console.log(`  already correct, left alone          : ${identityMap}`);
console.log(`  stored text differs from source      : ${drifted.length}${drifted.length ? " → " + drifted.slice(0, 5).join(", ") : ""}`);
console.log(`  rows with only UNSAFE forms, left alone: ${unsafeOnly.size}`);

console.log("\nsample of planned rewrites:");
for (const p of planned.slice(0, 4)) {
  const pick = (s: string) => (s.match(/.{0,60}(\([A-D]\)|option\s+[A-D]).{0,60}/i) ?? [""])[0].replace(/\s+/g, " ");
  console.log(`  ${p.row.source_id}  [${p.map}]`);
  console.log(`    before: …${pick(p.before)}…`);
  console.log(`    after : …${pick(p.after)}…`);
}

if (DRY) {
  console.log("\nDRY RUN — nothing written.");
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
let wrote = 0, failed = 0;
for (const p of planned) {
  const { error } = await db.from("questions").update({ explanation: p.after }).eq("id", p.row.id);
  if (error) { failed++; if (failed <= 3) console.error(`  ${p.row.source_id}: ${error.message}`); }
  else wrote++;
  if (wrote % 200 === 0) process.stdout.write(`  updated ${wrote}/${planned.length}\r`);
}
console.log(`\nupdated ${wrote} rows in ${ENV}${failed ? `, ${failed} failed` : ""}`);

// ── Keep the CSV in step, so a re-import carries the fix ────────────────────
if (WRITE_CSV) {
  const fixes = new Map(planned.map((p) => [p.row.source_id, p.after]));
  let text = readFileSync(CSV, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Parse, patch the explanation column, re-serialise.
  const rowsCsv: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rowsCsv.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rowsCsv.push(row); }
  const header = rowsCsv[0];
  const idIdx = header.indexOf("source_id");
  const expIdx = header.indexOf("explanation");
  let patched = 0;
  for (let r = 1; r < rowsCsv.length; r++) {
    const fix = fixes.get(rowsCsv[r][idIdx]);
    if (fix !== undefined && rowsCsv[r][expIdx] !== fix) { rowsCsv[r][expIdx] = fix; patched++; }
  }
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync(CSV, rowsCsv.filter((r) => r.some((v) => v.trim() !== "")).map((r) => r.map(esc).join(",")).join("\n") + "\n");
  console.log(`patched ${patched} explanations in ${CSV}`);
}
}

main().catch((e) => { console.error("\nFATAL:", e?.message ?? e); process.exit(1); });
