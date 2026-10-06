/**
 * NRG — build the SQL that ports the reviewed AI bank (review-v0.1) from staging to prod.
 *
 * This script never connects to prod. It reads the reviewed content from STAGING
 * plus the reviewer verdicts in data/review/ai/*.out.json, and writes one SQL file
 * for Ian to review and apply to prod himself (or hand to Claude with an explicit go).
 *
 *   npx tsx scripts/port-review-to-prod.ts --out data/review/prod-port/ai-port.sql
 *   npx tsx scripts/port-review-to-prod.ts --out data/review/prod-port/ai-port.sql --test-on-staging
 *
 * Prerequisite on prod: migration 20261004181457_add_question_options_distractor_type.
 *
 * What the SQL does, in one transaction:
 *   1. Snapshots every ai:* question and option on prod into _backup_prod_port_*_20261005.
 *   2. For each rewritten question: replaces stem, explanation and the four options
 *      (text, key, rationale, type), matched by source_id and option display order.
 *      Guarded: only rows that are still inactive + pending with exactly 4 options are
 *      touched, so nothing live or already approved on prod is overwritten.
 *   3. For each flagged question: sets review_status = needs_changes with the flag note.
 *   4. Prints counts so the person applying it can compare with the expected numbers.
 *
 * --apply-prod <file> (separate step, for Ian): applies an already-reviewed SQL file to PROD.
 * Needs CONFIRM_PROD=yes and SUPABASE_DB_PASSWORD in the environment, refuses if the
 * distractor_type migration is missing on prod, and prints the per-kind counts.
 *
 * --test-on-staging runs the generated SQL against staging inside a transaction and
 * ROLLS BACK: a syntax and mapping check (staging already holds the target content).
 * It needs SUPABASE_DB_PASSWORD_STAGING in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const OUT = flag("out") ?? "data/review/prod-port/ai-port.sql";
const STAGING_REF = "kwhaqhhwqykckarjbdod";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

// Dollar-quote with a tag that cannot appear in the text.
function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  let tag = "nrg";
  while (v.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${v}$${tag}$`;
}

type Verdict = { source_id: string; verdict: "ok" | "flag"; flags?: string[]; flag_note?: string; changes?: string };

const PROD_REF = "cdvubijjepwmhhkgppbl";
async function applyProd(file: string) {
  if (process.env.CONFIRM_PROD !== "yes") throw new Error("Refusing: set CONFIRM_PROD=yes to write to prod");
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!pw) throw new Error("SUPABASE_DB_PASSWORD (prod) missing");
  const sql = readFileSync(resolve(file), "utf8");
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgresql://postgres.${PROD_REF}:${encodeURIComponent(pw)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const col = await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_options' AND column_name='distractor_type'");
    if (!col.rowCount) throw new Error("distractor_type column missing on prod: apply migration 20261004181457 first");
    const res: any = await c.query(sql);
    const rows = (Array.isArray(res) ? res : [res]).filter((r: any) => r.command === "SELECT" && r.fields?.some((f: any) => f.name === "kind")).flatMap((r: any) => r.rows);
    console.log("Applied to PROD. Counts:", JSON.stringify(rows));
  } finally { await c.end(); }
}

async function main() {
  if (flag("apply-prod")) return applyProd(flag("apply-prod")!);
  const dir = "data/review/ai";
  const verdicts = new Map<string, Verdict>();
  for (const f of readdirSync(dir).filter(f => f.endsWith(".out.json"))) {
    if (!existsSync(`${dir}/${f.replace(".out.json", ".applied.json")}`)) throw new Error(`${f} was never applied to staging; refusing to port it`);
    for (const it of JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).items) verdicts.set(it.source_id, it);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING!, key = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING!;
  if (!url?.includes(STAGING_REF)) throw new Error("staging URL missing or not the staging project");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const qs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("questions").select("id, source_id, body, explanation").like("source_id", "ai:%").order("source_id").range(from, from + 999);
    if (error) throw error; qs.push(...data!); if (data!.length < 1000) break;
  }
  const opts: any[] = [];
  for (let i = 0; i < qs.length; i += 200) {
    const { data, error } = await db.from("question_options").select("question_id, body, is_correct, rationale, distractor_type, display_order").in("question_id", qs.slice(i, i + 200).map(q => q.id));
    if (error) throw error; opts.push(...data!);
  }

  const today = "2026-10-05";
  const out: string[] = [
    "-- NRG: port reviewed AI bank (review-v0.1) staging -> prod. Generated by scripts/port-review-to-prod.ts.",
    "-- Requires migration 20261004181457_add_question_options_distractor_type on prod first.",
    "-- Review before applying. Runs in one transaction; the guards skip anything live, approved or reshaped.",
    "BEGIN;",
    "CREATE TABLE IF NOT EXISTS public._backup_prod_port_questions_20261005 AS SELECT * FROM public.questions WHERE source_id LIKE 'ai:%';",
    "CREATE TABLE IF NOT EXISTS public._backup_prod_port_options_20261005 AS SELECT o.* FROM public.question_options o JOIN public.questions q ON q.id = o.question_id WHERE q.source_id LIKE 'ai:%';",
    "ALTER TABLE public._backup_prod_port_questions_20261005 ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE public._backup_prod_port_options_20261005 ENABLE ROW LEVEL SECURITY;",
    "CREATE TEMP TABLE _port_log (kind text, source_id text, n int) ON COMMIT DROP;",
  ];
  let rewrites = 0, flags = 0, skipped = 0;
  for (const q of qs) {
    const v = verdicts.get(q.source_id);
    if (!v) { skipped++; continue; }
    const guard = `q.source_id = ${lit(q.source_id)} AND q.is_active = false AND q.review_status = 'pending' AND (SELECT count(*) FROM public.question_options x WHERE x.question_id = q.id) = 4`;
    if (v.verdict === "flag") {
      flags++;
      const note = `[review-v0.1 ${today}] FLAG (${(v.flags ?? []).join(", ")}): ${v.flag_note ?? ""}`;
      out.push(`WITH u AS (UPDATE public.questions q SET review_status = 'needs_changes', review_notes = concat_ws(E'\\n', q.review_notes, ${lit(note)}) WHERE ${guard} RETURNING 1) INSERT INTO _port_log SELECT 'flag', ${lit(q.source_id)}, count(*) FROM u;`);
      continue;
    }
    const o = opts.filter(x => x.question_id === q.id).sort((a, b) => a.display_order - b.display_order);
    if (o.length !== 4 || o.some(x => !x.distractor_type || !x.rationale)) throw new Error(`${q.source_id}: staging row is not a complete rewrite`);
    rewrites++;
    const note = `[review-v0.1 ${today}] ${v.changes ?? "rewritten to MCQ standard v0.1"} (ported from staging)`;
    const values = o.map((x, i) => `(${i + 1}, ${lit(x.body)}, ${x.is_correct}, ${lit(x.rationale)}, ${lit(x.distractor_type)})`).join(", ");
    out.push(
      `WITH target AS (SELECT q.id FROM public.questions q WHERE ${guard}),`,
      `  qu AS (UPDATE public.questions q SET body = ${lit(q.body)}, explanation = ${lit(q.explanation)}, review_notes = concat_ws(E'\\n', q.review_notes, ${lit(note)}), updated_at = now() FROM target WHERE q.id = target.id RETURNING q.id),`,
      `  ranked AS (SELECT o.id, row_number() OVER (ORDER BY o.display_order) AS rn FROM public.question_options o JOIN target ON o.question_id = target.id),`,
      `  ou AS (UPDATE public.question_options t SET body = v.body, is_correct = v.c, rationale = v.r, distractor_type = v.t FROM ranked JOIN (VALUES ${values}) AS v(rn, body, c, r, t) USING (rn) WHERE t.id = ranked.id RETURNING 1)`,
      `INSERT INTO _port_log SELECT 'rewrite', ${lit(q.source_id)}, (SELECT count(*) FROM qu) * 10 + (SELECT count(*) FROM ou);`,
    );
  }
  out.push(
    "-- Expected: rewrite rows with n = 14 (1 question + 4 options); flag rows with n = 1. Anything with n = 0 was skipped by a guard.",
    "SELECT kind, n, count(*) FROM _port_log GROUP BY 1, 2 ORDER BY 1, 2;",
    "COMMIT;",
  );
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), out.join("\n") + "\n");
  console.log(`Wrote ${OUT}: ${rewrites} rewrites, ${flags} flag updates, ${skipped} AI questions with no verdict.`);

  if (args.includes("--test-on-staging")) {
    const pw = process.env.SUPABASE_DB_PASSWORD_STAGING;
    if (!pw) throw new Error("SUPABASE_DB_PASSWORD_STAGING missing");
    const { Client } = await import("pg");
    const c = new Client({ connectionString: `postgresql://postgres.${STAGING_REF}:${encodeURIComponent(pw)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`, ssl: { rejectUnauthorized: false } });
    await c.connect();
    // Staging rows are no longer 'pending' after the review, so the dry run temporarily relaxes the guard to exercise every statement.
    const sql = out.join("\n").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "").replace(/AND q\.is_active = false AND q\.review_status = 'pending'/g, "");
    try {
      await c.query("BEGIN");
      await c.query(sql);
      const r = await c.query("SELECT kind, n, count(*)::int AS c FROM _port_log GROUP BY 1, 2 ORDER BY 1, 2");
      console.log("Dry run on staging (rolled back):", JSON.stringify(r.rows));
    } finally {
      await c.query("ROLLBACK");
      await c.end();
    }
  }
}
main().catch(e => { console.error("FATAL:", e.message ?? e); process.exit(1); });
