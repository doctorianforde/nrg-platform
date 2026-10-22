/**
 * NRG — AI grading of student-written questions (Jade's Template 3). The second pathway beside the app's instant API
 * grading: evaluations queued in question_evaluations (qgen_config.grading_mode = 'agent', or API grading that failed)
 * are graded in batches, either by an agent session on the existing subscriptions or through the API.
 *
 *   queue                                   how many are waiting, oldest first
 *   pull [--limit 20] --out grading.json    mark up to N queued as running and write a bundle for an agent session:
 *                                           the grader's instructions, each question, and the answer format.
 *                                           Brief: docs/phase-1/QGEN_GRADING_BRIEF.md
 *   finish <results.json>                   check each agent grade against the schema, add up the scores, store them.
 *                                           Anything malformed is reported and put back in the queue.
 *   grade --with anthropic [--limit 20]     grade queued ones through the Anthropic API (ANTHROPIC_API_KEY; paid)
 *   requeue [--older-than 60]               put "running" evaluations older than N minutes back in the queue
 *
 * --env staging (default) | prod. Prod needs CONFIRM_PROD=1 and the prod keys in .env.local; the project ref is checked.
 * Grades are advice: a teacher still approves every question before it goes live.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GRADE_SCHEMA, GRADER_SYSTEM, evaluationRecord, graderUserPrompt, type Assignment, type StudentQuestion } from "../src/lib/grading/rubric";
import { gradeWithClaude } from "../src/lib/grading/claude";

const args = process.argv.slice(2);
const [cmd, target] = args;
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const die = (msg: string): never => { console.error(msg); process.exit(2); };

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

function db() {
  const env = flag("env") ?? "staging";
  if (env === "prod") {
    if (process.env.CONFIRM_PROD !== "1") die("Refusing prod without CONFIRM_PROD=1");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url.includes("cdvubijjepwmhhkgppbl")) die("Refusing: NEXT_PUBLIC_SUPABASE_URL is not the prod project");
    return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING ?? "";
  if (!url.includes("kwhaqhhwqykckarjbdod")) die("Refusing: staging URL missing or not the staging project");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING!, { auth: { persistSession: false } });
}

type Stored = Assignment & { question: StudentQuestion };
type EvalRow = { id: string; created_at: string; assignment: Stored };

async function passMark(sb: ReturnType<typeof db>) {
  const { data } = await sb.from("qgen_config").select("value").eq("key", "pass_mark").maybeSingle();
  return Number(data?.value) || 75;
}

async function claim(sb: ReturnType<typeof db>, limit: number): Promise<EvalRow[]> {
  const { data: queued, error } = await sb.from("question_evaluations").select("id").eq("status", "queued").order("created_at").limit(limit);
  if (error) die(error.message);
  const ids = (queued ?? []).map((r) => r.id);
  if (!ids.length) return [];
  const { data, error: e2 } = await sb.from("question_evaluations")
    .update({ status: "running", started_at: new Date().toISOString() })
    .in("id", ids).eq("status", "queued").select("id, created_at, assignment");
  if (e2) die(e2.message);
  return (data ?? []) as EvalRow[];
}

async function main() {
  const sb = db();
  switch (cmd) {
    case "queue": {
      const { data, error } = await sb.from("question_evaluations").select("id, status, created_at, error").in("status", ["queued", "running"]).order("created_at");
      if (error) die(error.message);
      if (!data?.length) return console.log("Nothing waiting.");
      for (const r of data) console.log(`${r.status.padEnd(8)} ${r.created_at.slice(0, 16)}  ${r.id}${r.error ? `  (${r.error})` : ""}`);
      console.log(`\n${data.filter((r) => r.status === "queued").length} queued, ${data.filter((r) => r.status === "running").length} running`);
      return;
    }
    case "pull": {
      const out = flag("out") ?? die("pull needs --out <file.json>");
      const rows = await claim(sb, Number(flag("limit") ?? 20));
      if (!rows.length) return console.log("Nothing queued.");
      const bundle = {
        how_to: "Grade every item as the instructions say. Write results to a JSON file: an array of { \"evaluation_id\": \"…\", \"grade\": { …the answer_format… } }, one per item, then run: npx tsx scripts/grade-questions.ts finish <that file>",
        instructions: GRADER_SYSTEM,
        answer_format: {
          key_check: { student_key_is_correct: "boolean", single_best_answer: "boolean", note: "string" },
          stem: { score: "0–30", strengths: "string", improve: "string" },
          options: { score: "0–45", strengths: "string", improve: "string" },
          alignment: { score: "0–25", domain_match: "boolean", taxonomy_match: "boolean", stem_length_match: "boolean", feedback: "string" },
          rationale: { provided: "boolean", bonus: "0 | 3 | 5", feedback: "string" },
          summary: "string",
          next_steps: ["string (up to three)"],
        },
        items: rows.map((r) => ({ evaluation_id: r.id, prompt: graderUserPrompt(r.assignment, r.assignment.question) })),
      };
      writeFileSync(resolve(out), JSON.stringify(bundle, null, 2) + "\n");
      console.log(`Pulled ${rows.length} → ${out} (marked running). Grade them, then: npx tsx scripts/grade-questions.ts finish <results.json>`);
      return;
    }
    case "finish": {
      if (!target || !existsSync(resolve(target))) die(`no results file at ${target}`);
      const results = JSON.parse(readFileSync(resolve(target), "utf8")) as { evaluation_id: string; grade: unknown }[];
      if (!Array.isArray(results)) die("results must be a JSON array");
      const pm = await passMark(sb);
      let ok = 0;
      for (const r of results) {
        const parsed = GRADE_SCHEMA.safeParse(r.grade);
        if (!parsed.success) {
          console.log(`✗ ${r.evaluation_id}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")} — back in the queue`);
          await sb.from("question_evaluations").update({ status: "queued", started_at: null, error: "agent grade malformed" }).eq("id", r.evaluation_id).eq("status", "running");
          continue;
        }
        const rec = evaluationRecord(parsed.data, pm, flag("model") ?? "agent-session");
        const { data, error } = await sb.from("question_evaluations").update(rec).eq("id", r.evaluation_id).eq("status", "running").select("id");
        if (error || !data?.length) { console.log(`✗ ${r.evaluation_id}: not running any more (${error?.message ?? "already finished or requeued"})`); continue; }
        ok++;
        console.log(`✓ ${r.evaluation_id}: ${rec.overall}/100 ${rec.passed ? "PASS" : "not yet"}`);
      }
      console.log(`\n${ok} of ${results.length} stored`);
      return;
    }
    case "grade": {
      if (flag("with") !== "anthropic") die("grade needs --with anthropic");
      const rows = await claim(sb, Number(flag("limit") ?? 20));
      const pm = await passMark(sb);
      for (const r of rows) {
        const g = await gradeWithClaude(r.assignment, r.assignment.question);
        if (!g.ok) {
          await sb.from("question_evaluations").update({ status: "queued", started_at: null, error: g.error }).eq("id", r.id);
          console.log(`✗ ${r.id}: ${g.error} — back in the queue`);
          continue;
        }
        const rec = evaluationRecord(g.grade, pm, g.model);
        await sb.from("question_evaluations").update({ ...rec, pathway: "api" }).eq("id", r.id);
        console.log(`✓ ${r.id}: ${rec.overall}/100 ${rec.passed ? "PASS" : "not yet"}`);
      }
      if (!rows.length) console.log("Nothing queued.");
      return;
    }
    case "requeue": {
      const mins = Number(flag("older-than") ?? 60);
      const { data, error } = await sb.from("question_evaluations").update({ status: "queued", started_at: null })
        .eq("status", "running").lt("started_at", new Date(Date.now() - mins * 60000).toISOString()).select("id");
      if (error) die(error.message);
      console.log(`${data?.length ?? 0} put back in the queue`);
      return;
    }
    default:
      die("usage: queue | pull --out f.json [--limit N] | finish results.json | grade --with anthropic [--limit N] | requeue [--older-than M]   [--env staging|prod]");
  }
}
main();
