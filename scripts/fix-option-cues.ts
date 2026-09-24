/**
 * NRG — repair answer-option cues in the AI-generated question bank.
 *
 * The 2,000 `ai:*` questions carry two giveaway cues, measured on staging
 * 2026-09-24: the correct option is the LONGEST in 83% of items (chance = 25%)
 * and is COMPOUND ("and"/comma) in 80% vs 31% of distractors. A student who
 * never reads the stem and picks the longest option scores ~83%. The items
 * measure test-wiseness, not nursing.
 *
 * This tool is the repair harness. It does NOT write the new options itself —
 * the rewrites come from a JSON file, whoever or whatever produced them. That
 * split is deliberate: the original generation run was already told
 * "distractors are plausible, similar in length and grammar"
 * (docs/phase-1/nrg-item-writing-rules.md) and ignored it. Asking nicely does
 * not work; the constraint has to be MECHANICALLY enforced on the way in, which
 * is what --apply does.
 *
 *   npx tsx scripts/fix-option-cues.ts --fetch --limit 100 --out /tmp/batch1.json
 *   npx tsx scripts/fix-option-cues.ts --apply --in /tmp/batch1.rewrites.json [--commit]
 *   npx tsx scripts/fix-option-cues.ts --report [--source-ids-from /tmp/batch1.json]
 *
 * Staging only by design — there is no --env flag and no prod code path. Prod's
 * 2,000 AI questions are byte-identical and inert (is_active=false), so they can
 * be re-fixed from staging once a human has signed the content off.
 *
 * --apply is a DRY RUN unless --commit is passed.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING
 * from .env.local.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Validator thresholds ────────────────────────────────────────────────────
// Rejection rules, not suggestions. Tuned against the measured baseline:
// correct 110.6 chars vs distractors 67.5 (a 43-char tell).
const MAX_LEN_RATIO = 1.25;  // longest option ÷ shortest option, within an item
const MAX_CORRECT_GAP = 12;  // chars the correct option may exceed the distractor mean by
const MIN_OPT_CHARS = 12;
const MAX_OPT_CHARS = 200;
const MIN_EXPLANATION_CHARS = 200; // Jade: rationales must cover the wrong options too
// Batch-level gate. Per-item rules cannot control this: an item is within the
// per-item tolerance and still has the correct option a character or two longer
// than the rest. Across a batch that skew has to sit near chance, or "pick the
// longest" still pays, just less obviously.
const MAX_BATCH_PCT_LONGEST = 35;
// Position is a cue too. Fixing the length tell while parking the answer in the
// same slot every time just swaps one giveaway for another, so the correct
// option's position has to stay near a 25% flat distribution.
const MAX_BATCH_PCT_ANY_POSITION = 35;

type Opt = { d: number; c: boolean; t: string };
type Item = {
  seq: number;
  id: string;
  source_id: string;
  dom: string;
  lvl: string;
  stem: string;
  explanation: string;
  opts: Opt[];
};
type Rewrite = {
  seq: number;
  source_id: string;
  options: string[];      // exactly 4, in the order they should be displayed
  correct_index: number;  // 0-based index into options
  explanation: string;
};

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function staging(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
  if (!url || !key) throw new Error("Missing staging URL/service-role key in .env.local");
  if (url.includes("cdvubijjepwmhhkgppbl")) throw new Error("Refusing to run: that is the PROD project ref");
  return createClient(url, key, { auth: { persistSession: false } });
}

const isCompound = (s: string) => /\band\b/i.test(s) || s.includes(",");

/**
 * PostgREST caps a plain select() at 1,000 rows and returns the truncated set
 * WITHOUT error — which silently halved the question bank the first time this
 * ran. Always page.
 */
async function fetchAllAiQuestions(db: SupabaseClient) {
  const PAGE = 500;
  const out: {
    id: string; source_id: string; body: string; explanation: string;
    cognitive_level: string; domain_id: string;
    question_options: { display_order: number; is_correct: boolean; body: string }[];
  }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("questions")
      .select("id, source_id, body, explanation, cognitive_level, domain_id, question_options(display_order, is_correct, body)")
      .like("source_id", "ai:%")
      .order("source_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as never as typeof out));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** The cue statistics. Same maths as the SQL that established the baseline. */
function cueStats(items: { opts: Opt[] }[]) {
  let longest = 0, gapSum = 0, correctSum = 0, distSum = 0, distN = 0;
  let correctCompound = 0, distCompound = 0;
  for (const it of items) {
    const c = it.opts.find(o => o.c)!;
    const ds = it.opts.filter(o => !o.c);
    const dMax = Math.max(...ds.map(o => o.t.length));
    const dMean = ds.reduce((a, o) => a + o.t.length, 0) / ds.length;
    if (c.t.length > dMax) longest++;
    gapSum += c.t.length - dMean;
    correctSum += c.t.length;
    distSum += ds.reduce((a, o) => a + o.t.length, 0);
    distN += ds.length;
    if (isCompound(c.t)) correctCompound++;
    for (const d of ds) if (isCompound(d.t)) distCompound++;
  }
  const n = items.length;
  return {
    n,
    pctCorrectLongest: +(100 * longest / n).toFixed(1),
    avgCorrectChars: +(correctSum / n).toFixed(1),
    avgDistractorChars: +(distSum / distN).toFixed(1),
    avgGapChars: +(gapSum / n).toFixed(1),
    pctCorrectCompound: +(100 * correctCompound / n).toFixed(1),
    pctDistractorCompound: +(100 * distCompound / distN).toFixed(1),
  };
}

function printStats(label: string, s: ReturnType<typeof cueStats>) {
  console.log(`\n  ${label} (n=${s.n})`);
  console.log(`    correct is longest      ${String(s.pctCorrectLongest).padStart(6)}%   (chance 25%)`);
  console.log(`    correct / distractor    ${String(s.avgCorrectChars).padStart(6)} / ${s.avgDistractorChars} chars`);
  console.log(`    mean length tell        ${String(s.avgGapChars).padStart(6)} chars`);
  console.log(`    compound: correct       ${String(s.pctCorrectCompound).padStart(6)}%   distractors ${s.pctDistractorCompound}%`);
}

// ─── --fetch ─────────────────────────────────────────────────────────────────
// Deterministic selection: only items that actually carry the length cue,
// quota'd per RENR domain so the sample mirrors the bank, ordered by md5(id)
// so the same --limit always returns the same items.
async function fetchBatch(limit: number, out: string, excludeFrom?: string) {
  const db = staging();
  const qs = await fetchAllAiQuestions(db);
  console.log(`  read ${qs.length} ai:* questions from staging`);

  const { data: doms, error: dErr } = await db.from("domains").select("id, code");
  if (dErr) throw dErr;
  const domCode = new Map(doms!.map(d => [d.id, d.code as string]));

  const md5 = (s: string) => createHash("md5").update(s).digest("hex");

  const all = qs
    .map(q => {
      const opts: Opt[] = q.question_options
        .map(o => ({ d: o.display_order, c: o.is_correct, t: o.body }))
        .sort((a, b) => a.d - b.d);
      return { ...q, opts, dom: domCode.get(q.domain_id) ?? "??" };
    })
    .filter(q => q.opts.length === 4 && q.opts.filter(o => o.c).length === 1);

  // Items already rewritten in an earlier batch are excluded by source_id rather
  // than relying on the cue filter: a rewritten item can still be marginally the
  // longest (21% of batch 1 are) and would otherwise be picked up twice.
  const done = new Set<string>();
  if (excludeFrom) {
    for (const f of excludeFrom.split(",")) {
      const raw = JSON.parse(readFileSync(f.trim(), "utf8"));
      const list: Item[] = Array.isArray(raw) ? raw : raw.items;
      for (const i of list) done.add(i.source_id);
    }
    console.log(`  excluding ${done.size} already-rewritten questions`);
  }

  const flagged = all.filter(q => {
    if (done.has(q.source_id)) return false;
    const c = q.opts.find(o => o.c)!;
    const dMax = Math.max(...q.opts.filter(o => !o.c).map(o => o.t.length));
    return c.t.length > dMax;
  });
  console.log(`  ${flagged.length} of ${all.length} still carry the length cue`);

  const byDom = new Map<string, typeof flagged>();
  for (const q of flagged) {
    if (!byDom.has(q.dom)) byDom.set(q.dom, []);
    byDom.get(q.dom)!.push(q);
  }
  const picked: typeof flagged = [];
  for (const [, list] of [...byDom.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => md5(a.id).localeCompare(md5(b.id)));
    picked.push(...list.slice(0, Math.round(limit * list.length / flagged.length)));
  }
  // Per-domain quotas round down to fewer than `limit`; top up deterministically
  // from whatever is left so the batch size is exactly what was asked for.
  if (picked.length < limit) {
    const taken = new Set(picked.map(q => q.id));
    const rest = flagged.filter(q => !taken.has(q.id)).sort((a, b) => md5(a.id).localeCompare(md5(b.id)));
    picked.push(...rest.slice(0, limit - picked.length));
  }
  picked.sort((a, b) => a.dom.localeCompare(b.dom) || md5(a.id).localeCompare(md5(b.id)));

  const items: Item[] = picked.slice(0, limit).map((q, i) => ({
    seq: i + 1,
    id: q.id,
    source_id: q.source_id,
    dom: q.dom,
    lvl: q.cognitive_level,
    stem: q.body,
    explanation: q.explanation,
    opts: q.opts,
  }));

  writeFileSync(out, JSON.stringify(items, null, 2));
  console.log(`Wrote ${items.length} items to ${out}`);
  console.log(`  (this file is also the BACKUP of the originals — keep it until the rewrite is signed off)`);
  const spread = new Map<string, number>();
  for (const it of items) spread.set(it.dom, (spread.get(it.dom) ?? 0) + 1);
  console.log(`  domains: ${[...spread.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  printStats("BEFORE", cueStats(items));
}

// ─── --apply ─────────────────────────────────────────────────────────────────
function validate(item: Item, rw: Rewrite): string[] {
  const errs: string[] = [];
  const o = rw.options;
  if (!Array.isArray(o) || o.length !== 4) return [`expected 4 options, got ${o?.length}`];
  if (!(rw.correct_index >= 0 && rw.correct_index <= 3)) errs.push(`correct_index out of range: ${rw.correct_index}`);
  if (rw.source_id && rw.source_id !== item.source_id) errs.push(`source_id mismatch`);

  // Guard against a mis-keyed or half-pasted rewrite: a real rewrite replaces
  // the options, so near-identical text means the wrong item was edited.
  const same = o.filter(t => item.opts.some(x => x.t.trim() === t.trim())).length;
  if (same > 1) errs.push(`${same}/4 options are unchanged from the original — wrong item, or not actually rewritten`);

  const lens = o.map(t => t.length);
  const correct = lens[rw.correct_index];
  const distractors = lens.filter((_, i) => i !== rw.correct_index);
  const dMean = distractors.reduce((a, b) => a + b, 0) / distractors.length;

  if (Math.max(...lens) / Math.min(...lens) > MAX_LEN_RATIO)
    errs.push(`length spread ${(Math.max(...lens) / Math.min(...lens)).toFixed(2)}x exceeds ${MAX_LEN_RATIO}x (${lens.join("/")})`);
  if (correct - dMean > MAX_CORRECT_GAP)
    errs.push(`correct exceeds distractor mean by ${(correct - dMean).toFixed(0)} chars (max ${MAX_CORRECT_GAP})`);
  if (lens.some(l => l < MIN_OPT_CHARS || l > MAX_OPT_CHARS))
    errs.push(`option length outside ${MIN_OPT_CHARS}-${MAX_OPT_CHARS} chars (${lens.join("/")})`);

  // The compound cue: if the correct option is compound, at least two
  // distractors must be too, or "pick the one that does several things" survives.
  if (isCompound(o[rw.correct_index])) {
    const dc = o.filter((_, i) => i !== rw.correct_index).filter(isCompound).length;
    if (dc < 2) errs.push(`correct option is compound but only ${dc}/3 distractors are`);
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (new Set(o.map(norm)).size !== 4) errs.push(`options are not all distinct`);
  if (!rw.explanation || rw.explanation.length < MIN_EXPLANATION_CHARS)
    errs.push(`explanation too short (${rw.explanation?.length ?? 0} < ${MIN_EXPLANATION_CHARS}) — must say why each wrong option is wrong`);
  if (/\boption [abcd]\b|\b[abcd] is (correct|incorrect)\b/i.test(rw.explanation))
    errs.push(`explanation cites an option letter — options get reordered, so letters go stale`);

  return errs;
}

async function apply(inPath: string, commit: boolean) {
  const db = staging();
  const payload = JSON.parse(readFileSync(inPath, "utf8")) as { items: Item[]; rewrites: Rewrite[] };
  const items = payload.items;
  const rewrites = payload.rewrites;
  const bySeq = new Map(items.map(i => [i.seq, i]));

  const ok: { item: Item; rw: Rewrite }[] = [];
  const failed: { seq: number; source_id: string; errs: string[] }[] = [];
  for (const rw of rewrites) {
    const item = bySeq.get(rw.seq);
    if (!item) { failed.push({ seq: rw.seq, source_id: rw.source_id, errs: ["no matching item in batch"] }); continue; }
    const errs = validate(item, rw);
    if (errs.length) failed.push({ seq: rw.seq, source_id: item.source_id, errs });
    else ok.push({ item, rw });
  }

  console.log(`\nValidated ${rewrites.length} rewrites: ${ok.length} pass, ${failed.length} rejected`);
  for (const f of failed) console.log(`  REJECT seq ${f.seq} (${f.source_id}): ${f.errs.join("; ")}`);

  printStats("BEFORE", cueStats(items.filter(i => ok.some(o => o.item.seq === i.seq))));
  const after = cueStats(ok.map(({ rw }) => ({
    opts: rw.options.map((t, i) => ({ d: i, c: i === rw.correct_index, t })),
  })));
  printStats("AFTER ", after);

  const pos = [0, 0, 0, 0];
  for (const { rw } of ok) pos[rw.correct_index]++;
  const pctPos = pos.map(c => +(100 * c / ok.length).toFixed(1));
  console.log(`    answer position          ${pctPos.map((p, i) => `${i + 1}:${p}%`).join("  ")}`);
  if (Math.max(...pctPos) > MAX_BATCH_PCT_ANY_POSITION) {
    console.log(`\n  BATCH GATE FAILED: the correct answer sits in one position ${Math.max(...pctPos)}% of the time ` +
                `(limit ${MAX_BATCH_PCT_ANY_POSITION}%, chance 25%). Reorder some items' options.`);
    if (commit) { console.log(`  Refusing to write. Fix the batch and re-run.`); return; }
  }

  if (after.pctCorrectLongest > MAX_BATCH_PCT_LONGEST) {
    console.log(`\n  BATCH GATE FAILED: correct option is longest in ${after.pctCorrectLongest}% of items ` +
                `(limit ${MAX_BATCH_PCT_LONGEST}%, chance 25%).`);
    console.log(`  Items where it is longest — trim the correct option or lengthen a distractor:`);
    for (const { rw } of ok) {
      const lens = rw.options.map(t => t.length);
      const dMax = Math.max(...lens.filter((_, i) => i !== rw.correct_index));
      if (lens[rw.correct_index] > dMax)
        console.log(`    seq ${String(rw.seq).padStart(3)}  correct ${lens[rw.correct_index]} vs next ${dMax}`);
    }
    if (commit) { console.log(`\n  Refusing to write. Fix the batch and re-run.`); return; }
  }

  if (!commit) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to apply ${ok.length} rewrites to STAGING.`);
    return;
  }

  let done = 0;
  for (const { item, rw } of ok) {
    // Rewrite the four existing option rows in place, keyed by display_order,
    // so option ids and any rows referencing them stay valid.
    for (let i = 0; i < 4; i++) {
      const { error } = await db
        .from("question_options")
        .update({ body: rw.options[i], is_correct: i === rw.correct_index })
        .eq("question_id", item.id)
        .eq("display_order", item.opts[i].d);
      if (error) throw new Error(`option update failed for ${item.source_id}: ${error.message}`);
    }
    const { error: qErr } = await db
      .from("questions")
      .update({ explanation: rw.explanation })
      .eq("id", item.id);
    if (qErr) throw new Error(`explanation update failed for ${item.source_id}: ${qErr.message}`);
    done++;
    if (done % 20 === 0) console.log(`  ...${done}/${ok.length}`);
  }
  console.log(`\nApplied ${done} rewrites to STAGING. Review status untouched — every item stays 'pending'.`);
}

// ─── --report ────────────────────────────────────────────────────────────────
async function report(sourceIdsFrom?: string) {
  const db = staging();
  const data = await fetchAllAiQuestions(db);
  console.log(`  read ${data.length} ai:* questions from staging`);

  let rows = data
    .map(q => ({
      source_id: q.source_id,
      opts: q.question_options.map(o => ({ d: o.display_order, c: o.is_correct, t: o.body })).sort((a, b) => a.d - b.d),
    }))
    .filter(q => q.opts.length === 4 && q.opts.filter(o => o.c).length === 1);

  if (sourceIdsFrom) {
    const raw = JSON.parse(readFileSync(sourceIdsFrom, "utf8"));
    const list: Item[] = Array.isArray(raw) ? raw : raw.items;
    const ids = new Set(list.map(i => i.source_id));
    const inBatch = rows.filter(r => ids.has(r.source_id));
    const rest = rows.filter(r => !ids.has(r.source_id));
    printStats("REWRITTEN BATCH", cueStats(inBatch));
    printStats("REST OF BANK   ", cueStats(rest));
    return;
  }
  printStats("WHOLE AI BANK", cueStats(rows));
}

async function main() {
  const a = process.argv.slice(2);
  const flag = (n: string) => a.includes(n);
  const val = (n: string) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };

  if (flag("--fetch")) return fetchBatch(Number(val("--limit") ?? 100), val("--out") ?? "batch.json", val("--exclude"));
  if (flag("--apply")) return apply(val("--in")!, flag("--commit"));
  if (flag("--report")) return report(val("--source-ids-from"));
  console.log("Usage: --fetch --limit N --out FILE | --apply --in FILE [--commit] | --report [--source-ids-from FILE]");
}

main().catch(e => { console.error(e); process.exit(1); });
