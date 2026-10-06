/**
 * NRG — review the existing question bank against MCQ standard v0.1.
 *
 * Same split as fix-option-cues.ts: this tool exports, checks and applies; the
 * rewrites themselves come from a reviewer (Claude Code / Kimi Code subagents,
 * or a person) working from docs/phase-1/REVIEW_BRIEF.md. Every rewrite must
 * pass the shared validator (scripts/lib/mcq-standard.ts) before it can be applied.
 *
 *   npx tsx scripts/review-bank.ts --export --pool ai --from 0 --count 25 --out data/review/ai/b0000.in.json
 *   npx tsx scripts/review-bank.ts --check  --in data/review/ai/b0000.out.json
 *   npx tsx scripts/review-bank.ts --apply  --in data/review/ai/b0000.out.json [--commit]
 *   npx tsx scripts/review-bank.ts --status
 *
 * Pools: ai (ai:*), proto (proto:*), jade (jade:*). Ordered by source_id, so
 * --from/--count windows are stable.
 *
 * STAGING ONLY. There is no prod code path; prod gets reviewed content later,
 * by source_id, after Ian signs it off. Jade's questions are never written by
 * --apply: they are his content, so his batches are proposals for his sign-off.
 * --apply is a DRY RUN unless --commit is passed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checkMcq, loadRules } from "./lib/mcq-standard";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (n: string) => args.includes(`--${n}`);
const REVIEW_TAG = "review-v0.1";
const GENDERED = /\b(he|him|his|she|her|hers|himself|herself|man|woman|men|women|boy|girl|male|female|mother|father|mom|mum|dad|grandmother|grandfather|aunt|uncle|sister|brother|son|daughter|wife|husband|pregnan\w*|gravida|postpartum|postnatal|antenatal|labour|labor|breast\w*|Mr|Mrs|Ms|Miss)\b/i;
// Negative stems ("needs further teaching", "NOT", "avoid") don't fit one-of-each option types: their distractors are true.
// Policy pending with Ian/Jade, so they are flagged, never rewritten in place. Tested on the question sentence only.
const NEG_CAPS = /\b(NOT|EXCEPT|LEAST)\b/;
const NEG = /needs? (for )?(further|more|additional) (teaching|education|instruction)|requires? (further|more|additional) (teaching|education)|need for (further|more|additional) (teaching|education)|non-?therapeutic|be avoided|should (the )?(nurse|client|mother|family|staff|student|parents?)? ?avoid\b|contraindicated|inappropriate|least (appropriate|helpful|likely|effective)|is incorrect|unsafe|teaching (has been|was) (un|in)effective|misunderstanding/i;
const questionSentence = (stem: string) => { const parts = stem.trim().split(/(?<=[.!?])\s+(?=[A-Z"])/); return parts[parts.length - 1]; };
const FLAG_NAMES = ["clinical-key", "negative-stem", "scope", "duplicate", "image", "needs-jade"];
const PRONOUN = /\b(he|him|his|she|her|hers|himself|herself)\b/i;
const POOLS: Record<string, string> = { ai: "ai:%", proto: "proto:%", jade: "jade:%" };

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
function staging(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING ?? process.env.SUPABASE_URL_STAGING;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING");
  if (!url.includes("kwhaqhhwqykckarjbdod")) throw new Error(`Refusing: ${url} is not the staging project`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const writeJson = (p: string, v: unknown) => { mkdirSync(dirname(resolve(p)), { recursive: true }); writeFileSync(resolve(p), JSON.stringify(v, null, 2)); };

type InItem = {
  id: string; source_id: string; pool: string; domain: string | null; cognitive_level: string | null; difficulty: string | null;
  review_status: string; is_active: boolean; stem: string; explanation: string | null;
  options: { label: string; text: string; is_correct: boolean; rationale: string | null }[];
};
type OutItem = {
  id: string; source_id: string; verdict: "ok" | "flag";
  stem: string; options: { label: string; text: string }[]; correct: string[];
  rationale_correct: string; option_types: Record<string, string>; distractor_rationales: Record<string, string>;
  changes: string; flags?: string[]; flag_note?: string;
};

async function exportBatch() {
  const pool = flag("pool") ?? ""; if (!POOLS[pool]) throw new Error("--pool ai|proto|jade");
  const from = Number(flag("from") ?? 0), count = Number(flag("count") ?? 25), out = flag("out");
  if (!out) throw new Error("--out needed");
  const db = staging();
  const { data: doms } = await db.from("domains").select("id, code");
  const dom = new Map((doms ?? []).map(d => [d.id as number, d.code as string]));
  const { data: qs, error } = await db.from("questions")
    .select("id, source_id, domain_id, cognitive_level, difficulty, review_status, is_active, body, explanation")
    .like("source_id", POOLS[pool]).order("source_id").range(from, from + count - 1);
  if (error) throw error;
  const ids = qs!.map(q => q.id);
  const { data: opts, error: oErr } = await db.from("question_options").select("question_id, body, is_correct, rationale, display_order").in("question_id", ids);
  if (oErr) throw oErr;
  const items: InItem[] = qs!.map(q => {
    const o = opts!.filter(x => x.question_id === q.id).sort((a, b) => a.display_order - b.display_order);
    return { id: q.id, source_id: q.source_id, pool, domain: dom.get(q.domain_id) ?? null, cognitive_level: q.cognitive_level, difficulty: q.difficulty,
      review_status: q.review_status, is_active: q.is_active, stem: q.body, explanation: q.explanation,
      options: o.map((x, i) => ({ label: "ABCDEF"[i], text: x.body, is_correct: x.is_correct, rationale: x.rationale })) };
  });
  writeJson(out, { pool, from, count: items.length, exported_at: new Date().toISOString(), items });
  console.log(`Exported ${items.length} ${pool} questions (${from}–${from + items.length - 1}) → ${out}`);
}

function check(inPath: string) {
  const rules = loadRules(flag("rules") ?? "scripts/generation-rules.json");
  const doc = JSON.parse(readFileSync(resolve(inPath), "utf8"));
  const items: OutItem[] = doc.items ?? doc;
  const src = flag("source") ?? inPath.replace(/\.out\.json$/, ".in.json");
  const input: InItem[] | null = existsSync(src) ? JSON.parse(readFileSync(src, "utf8")).items : null;
  const results: { id: string; source_id: string; verdict: string; ok: boolean; error?: string; warnings?: string[] }[] = [];
  const pos: Record<string, number> = {}; let longest = 0, okCount = 0;
  for (const it of items) {
    if (input && !input.some(x => x.id === it.id)) { results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: false, error: "id not in the exported batch" }); continue; }
    if (it.verdict === "flag" && (!(it.flags ?? []).length || (it.flags ?? []).some(f => !FLAG_NAMES.includes(f)))) { results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: false, error: `flags must be one or more of ${FLAG_NAMES.join(", ")}` }); continue; }
    if (it.verdict === "flag" && !it.flag_note) { results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: false, error: "flag without flag_note" }); continue; }
    if (it.verdict === "flag" && !it.stem) { results.push({ id: it.id, source_id: it.source_id, verdict: "flag", ok: true }); continue; }
    const r = checkMcq(it, rules);
    if (!r.ok) { results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: false, error: r.error }); continue; }
    const before = input?.find(x => x.id === it.id);
    if (before && it.verdict !== "flag") {
      const q = questionSentence(before.stem);
      if (NEG_CAPS.test(q) || NEG.test(q)) { results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: false, error: `negative stem ("${q.slice(0, 60)}"): flag it with flags ["negative-stem"] (policy pending)` }); continue; }
    }
    // Don't give a client a gender the original question never stated.
    if (before && !GENDERED.test([before.stem, ...before.options.map(o => o.text)].join(" "))) {
      const after = [it.stem, ...it.options.map(o => o.text), it.rationale_correct, ...Object.values(it.distractor_rationales ?? {})].join(" ");
      const m = after.match(PRONOUN);
      if (m) { results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: false, error: `introduces a gendered pronoun ("${m[0]}") the original never used; use "the client"` }); continue; }
    }
    okCount++;
    const c = r.item.correct[0]; pos[c] = (pos[c] ?? 0) + 1;
    const lens = r.item.options.map(o => o.text.length), cl = r.item.options.find(o => o.label === c)!.text.length;
    if (lens.filter(n => n >= cl).length === 1) longest++;
    results.push({ id: it.id, source_id: it.source_id, verdict: it.verdict, ok: true, warnings: r.warnings });
  }
  const missing = input ? input.filter(x => !items.some(y => y.id === x.id)).map(x => x.source_id) : [];
  const pct = (n: number) => (okCount ? Math.round((100 * n) / okCount) : 0);
  const L = rules.length_cue;
  const batch: string[] = [];
  if (okCount >= 8 && pct(longest) > L.max_batch_pct_longest) batch.push(`correct option is the longest in ${pct(longest)}% (limit ${L.max_batch_pct_longest}%)`);
  if (okCount >= 8) for (const [k, n] of Object.entries(pos)) if (pct(n) > L.max_batch_pct_any_position) batch.push(`correct answer is ${k} in ${pct(n)}% (limit ${L.max_batch_pct_any_position}%)`);
  const failed = results.filter(r => !r.ok);
  const summary = { checked: items.length, passed: results.length - failed.length, failed: failed.length, missing, flagged: items.filter(i => i.verdict === "flag").length,
    pct_correct_longest: pct(longest), correct_positions: pos, batch_problems: batch };
  console.log(JSON.stringify(summary));
  failed.forEach(f => console.log(`  ✗ ${f.source_id}: ${f.error}`));
  batch.forEach(b => console.log(`  ✗ BATCH: ${b}`));
  return { results, summary, items, input, pass: failed.length === 0 && missing.length === 0 && batch.length === 0 };
}

async function apply(inPath: string) {
  const commit = has("commit");
  const { results, items, input, pass } = check(inPath);
  if (!input) throw new Error("apply needs the matching .in.json next to the .out.json (or --source)");
  if (!pass) { console.error("Refusing to apply: fix the failures above first (the whole batch must pass)."); process.exit(1); }
  if (input[0]?.pool === "jade") { console.error("Refusing: Jade's questions are proposals for his sign-off and are never applied by this tool."); process.exit(1); }
  const db = staging();
  const today = new Date().toISOString().slice(0, 10);
  let applied = 0, flagged = 0;
  for (const it of items) {
    const ok = results.find(r => r.id === it.id)!;
    if (!ok.ok) continue;
    const note = `[${REVIEW_TAG} ${today}] ${it.verdict === "flag" ? `FLAG (${(it.flags ?? []).join(", ")}): ${it.flag_note}` : it.changes}`;
    const notes = note;
    if (it.verdict === "flag") {
      flagged++;
      if (!commit) continue;
      const { data: cur } = await db.from("questions").select("review_notes, review_status").eq("id", it.id).single();
      const { error } = await db.from("questions").update({
        review_notes: [cur?.review_notes, notes].filter(Boolean).join("\n"),
        review_status: cur?.review_status === "rejected" ? "rejected" : "needs_changes",
        is_active: false,
      }).eq("id", it.id);
      if (error) throw error;
      continue;
    }
    applied++;
    if (!commit) continue;
    const { data: rows, error: rErr } = await db.from("question_options").select("id, display_order").eq("question_id", it.id).order("display_order");
    if (rErr) throw rErr;
    if (rows!.length !== it.options.length) throw new Error(`${it.source_id}: has ${rows!.length} option rows, rewrite has ${it.options.length}`);
    const rat: Record<string, string> = { ...it.distractor_rationales, [it.correct[0]]: it.rationale_correct };
    for (let i = 0; i < rows!.length; i++) {
      const L = it.options[i].label;
      const { error } = await db.from("question_options").update({
        body: it.options[i].text, is_correct: it.correct.includes(L), rationale: rat[L], distractor_type: it.option_types[L],
      }).eq("id", rows![i].id);
      if (error) throw error;
    }
    const { data: cur } = await db.from("questions").select("review_notes").eq("id", it.id).single();
    const { error } = await db.from("questions").update({
      body: it.stem, explanation: it.rationale_correct, review_notes: [cur?.review_notes, notes].filter(Boolean).join("\n"), updated_at: new Date().toISOString(),
    }).eq("id", it.id);
    if (error) throw error;
  }
  console.log(`${commit ? "APPLIED" : "DRY RUN (add --commit)"}: ${applied} rewritten, ${flagged} flagged needs_changes, on staging.`);
  if (commit) writeJson(inPath.replace(/\.out\.json$/, ".applied.json"), { applied_at: new Date().toISOString(), applied, flagged });
}

async function status() {
  const db = staging();
  for (const [pool, like] of Object.entries(POOLS)) {
    const { count: total } = await db.from("questions").select("id", { count: "exact", head: true }).like("source_id", like);
    const { count: done } = await db.from("questions").select("id", { count: "exact", head: true }).like("source_id", like).like("review_notes", `%[${REVIEW_TAG}%`);
    console.log(`${pool.padEnd(6)} ${String(done).padStart(5)} / ${total} reviewed on staging`);
  }
}

(async () => {
  if (has("export")) return exportBatch();
  if (has("check")) { const r = check(flag("in")!); process.exit(r.pass ? 0 : 1); }
  if (has("apply")) return apply(flag("in")!);
  if (has("status")) return status();
  console.error("Use --export, --check, --apply or --status (see header).");
  process.exit(2);
})().catch(e => { console.error("FATAL:", e.message ?? e); process.exit(1); });
