/**
 * Post-import verification for the prototype bank (STAGING ONLY).
 *
 *   npx tsx scripts/verify-proto-import.ts
 *
 * Reads SUPABASE_URL_STAGING / SUPABASE_SERVICE_ROLE_KEY_STAGING from .env.local.
 * Read-only: SELECTs and count(*) head requests only. Safe to run any time.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSV = resolve(process.cwd(), "scripts/data/proto-import-clean.csv");

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

async function main() {
  loadEnv();
  const db = createClient(
    process.env.SUPABASE_URL_STAGING ?? process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING!,
    process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING!,
    { auth: { persistSession: false } }
  );
  const head = async (q: any) => (await q).count ?? -1;

  // --baseline: capture pre-import numbers, print as JSON, exit
  if (process.argv.includes("--baseline")) {
    const total = await head(db.from("questions").select("*", { count: "exact", head: true }));
    const topics = await head(db.from("topics").select("*", { count: "exact", head: true }));
    const nullCluster = await head(db.from("topics").select("*", { count: "exact", head: true }).is("cluster_id", null));
    const aiPending = await head(db.from("questions").select("*", { count: "exact", head: true }).eq("review_status", "pending").eq("is_ai_generated", true));
    const protoIds = await head(db.from("questions").select("*", { count: "exact", head: true }).like("source_id", "proto:%"));
    const { data: collSample } = await db.from("questions").select("source_id").like("source_id", "proto:%").limit(3);
    console.log(JSON.stringify({ total, topics, nullCluster, aiPending, protoSourceIds: protoIds, protoSample: collSample }, null, 1));
    return;
  }

  const csv = parseCsv(readFileSync(CSV, "utf8"));
  const header = csv.shift()!;
  const ix = Object.fromEntries(header.map((h, i) => [h, i]));
  const csvById = new Map(csv.map(r => [r[ix.source_id], r]));
  const csvDomains: Record<string, number> = {};
  const csvCog: Record<string, number> = {};
  for (const r of csv) {
    csvDomains[r[ix.domain]] = (csvDomains[r[ix.domain]] ?? 0) + 1;
    csvCog[r[ix.cognitive_level]] = (csvCog[r[ix.cognitive_level]] ?? 0) + 1;
  }

  // 1. Row counts
  const total = await head(db.from("questions").select("*", { count: "exact", head: true }));
  const proto = await head(db.from("questions").select("*", { count: "exact", head: true }).eq("source", "prototype-import"));
  console.log("1. questions total:", total, "| prototype-import rows:", proto);

  // 2. Flags on every imported row
  const flagRows: any[] = [];
  for (let s = 0; ; s += 1000) {
    const { data } = await db.from("questions").select("is_active, review_status, is_ai_generated, source").eq("source", "prototype-import").range(s, s + 999);
    if (!data?.length) break;
    flagRows.push(...data);
    if (data.length < 1000) break;
  }
  const bad: Record<string, number> = {};
  for (const r of flagRows) {
    if (r.is_active !== false) bad["is_active_not_false"] = (bad["is_active_not_false"] ?? 0) + 1;
    if (r.review_status !== "pending") bad["review_status_not_pending"] = (bad["review_status_not_pending"] ?? 0) + 1;
    if (r.is_ai_generated !== true) bad["not_ai_generated"] = (bad["not_ai_generated"] ?? 0) + 1;
  }
  console.log("2. flag violations among", flagRows.length, "imported rows:", Object.keys(bad).length ? bad : "none");

  // 2b. paginated full fetch of imported rows for sections 3+4
  const allProto: any[] = [];
  for (let s = 0; ; s += 1000) {
    const { data } = await db.from("questions").select("id, domain_id, cognitive_level").eq("source", "prototype-import").range(s, s + 999);
    if (!data?.length) break;
    allProto.push(...data);
    if (data.length < 1000) break;
  }
  const ids = allProto.map(r => r.id as string);

  // 3. Options: exactly 4, exactly 1 correct
  let optBad = 0; const optBadSamples: string[] = [];
  let optCoverage = 0;
  let optTotal = 0;
  for (let s = 0; s < ids.length; s += 200) {
    const { data: opts, error: optQErr } = await db.from("question_options").select("question_id, is_correct").in("question_id", ids.slice(s, s + 200));
    if (optQErr) throw new Error(`options query failed at ${s}: ${optQErr.message}`);
    if (!opts) throw new Error(`options query returned no data at ${s}`);
    optTotal += opts.length;
    const byQ = new Map<string, { n: number; c: number }>();
    for (const o of opts) {
      const e = byQ.get(o.question_id) ?? { n: 0, c: 0 };
      e.n++; if (o.is_correct) e.c++; byQ.set(o.question_id, e);
    }
    optCoverage += byQ.size;
    for (const [qid, e] of byQ) if (e.n !== 4 || e.c !== 1) { optBad++; if (optBadSamples.length < 5) optBadSamples.push(`${qid} options=${e.n} correct=${e.c}`); }
  }
  console.log("3. imported questions with options:", optCoverage, "| total option rows:", optTotal, "| options!=4 or correct!=1:", optBad, optBadSamples.length ? optBadSamples : "");

  // 4. Distributions vs CSV (full paginated sets)
  const domIds: Record<string, number> = {};
  for (const r of allProto) domIds[r.domain_id] = (domIds[r.domain_id] ?? 0) + 1;
  const { data: domTable } = await db.from("domains").select("id, code");
  const codeById = new Map((domTable ?? []).map(d => [d.id as number, d.code as string]));
  const dbDomains: Record<string, number> = {};
  for (const [id, n] of Object.entries(domIds)) { const c = codeById.get(Number(id)) ?? `id:${id}`; dbDomains[c] = (dbDomains[c] ?? 0) + n; }
  const dbCog: Record<string, number> = {};
  for (const r of allProto) { const k = r.cognitive_level ?? "null"; dbCog[k] = (dbCog[k] ?? 0) + 1; }
  console.log("4a. domains  csv:", JSON.stringify(csvDomains));
  console.log("    domains  db :", JSON.stringify(dbDomains));
  console.log("4b. cognitive csv (KC/AP/ASE):", JSON.stringify(csvCog));
  console.log("    cognitive db (mapped)   :", JSON.stringify(dbCog));

  // 5. Spot-check 20 random rows, letter-exact vs CSV
  const seedIds = [...csvById.keys()];
  let rngState = 42; const rng = () => (rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const picks = new Set<string>();
  while (picks.size < 20) picks.add(seedIds[Math.floor(rng() * seedIds.length)]);
  const { data: spotRows } = await db.from("questions").select("id, source_id, body, explanation").in("source_id", [...picks]);
  const { data: spotOpts } = await db.from("question_options").select("question_id, body, is_correct").in("question_id", spotRows!.map(r => r.id));
  const optsByQ = new Map<string, { body: string; is_correct: boolean }[]>();
  for (const o of spotOpts!) { const a = optsByQ.get(o.question_id) ?? []; a.push(o); optsByQ.set(o.question_id, a); }
  let mismatches = 0;
  for (const q of spotRows!) {
    const c = csvById.get(q.source_id!); if (!c) { console.log("   MISSING in CSV:", q.source_id); mismatches++; continue; }
    const problems: string[] = [];
    if (q.body !== c[ix.question]) problems.push("stem differs");
    if ((q.explanation ?? "") !== c[ix.explanation]) problems.push("explanation differs");
    const dbCorrect = optsByQ.get(q.id)!.filter(o => o.is_correct);
    if (dbCorrect.length !== 1) problems.push(`db correct count=${dbCorrect.length}`);
    else {
      const csvLetter = c[ix.correct];
      const csvKeyedText = c[ix["option_" + csvLetter.toLowerCase()]];
      if (dbCorrect[0].body !== csvKeyedText) problems.push(`keyed text differs: db="${dbCorrect[0].body.slice(0, 50)}" csv="${csvKeyedText.slice(0, 50)}"`);
    }
    if (problems.length) { mismatches++; console.log("   MISMATCH", q.source_id, "→", problems.join("; ")); }
  }
  console.log(`5. spot-check: ${spotRows!.length}/20 fetched, mismatches: ${mismatches}`);

  // 6. Nothing live
  const live = await head(db.from("questions").select("*", { count: "exact", head: true }).eq("source", "prototype-import").eq("is_active", true));
  console.log("6. prototype-import AND is_active=true (must be 0):", live);

  // 7. Review-queue presence: pending + ai + source, and the author tag
  const { count: queueCount } = await db.from("questions").select("*", { count: "exact", head: true }).eq("source", "prototype-import").eq("review_status", "pending").eq("is_ai_generated", true);
  const { data: tagRow } = await db.from("tags").select("id").eq("name", "Author: NRG prototype bank").maybeSingle();
  let tagCount = 0;
  if (tagRow) tagCount = await head(db.from("question_tags").select("*", { count: "exact", head: true }).eq("tag_id", tagRow.id));
  console.log("7. review-queue rows (pending+ai+prototype-import):", queueCount, "| 'Author: NRG prototype bank' tag links:", tagCount);

  // 8. Topic explosion
  const { count: topicsAfter } = await db.from("topics").select("*", { count: "exact", head: true });
  const { count: nullCluster } = await db.from("topics").select("*", { count: "exact", head: true }).is("cluster_id", null);
  let baseNote = "";
  try {
    const b = JSON.parse(readFileSync("/tmp/proto-baseline.json", "utf8"));
    baseNote = ` | created by this import: ${topicsAfter - b.topics} | NULL-cluster added: ${nullCluster - b.nullCluster} (baseline ${b.topics} topics / ${b.nullCluster} NULL)`;
  } catch { /* no baseline file */ }
  console.log("8. topics now:", topicsAfter, "| with cluster_id NULL (all topics):", nullCluster + baseNote);

  // Pre-existing rows untouched?
  const others = await head(db.from("questions").select("*", { count: "exact", head: true }).neq("source", "prototype-import"));
  console.log("9. non-prototype rows (pre-existing, must be 2516):", others);
}
main().catch(e => { console.error("FATAL:", e.message ?? e); process.exit(1); });
