/**
 * Import a case study JSON (scripts/lib/case-standard.ts format) into STAGING.
 *
 *   npx tsx scripts/import-case.ts --check content/case-studies/NRG-MH-001.json
 *   npx tsx scripts/import-case.ts content/case-studies/NRG-MH-001.json [--replace]
 *
 * The case lands as status=in_review, inactive, validation pending: a teacher reviews it at
 * /teacher/case-studies and it can only be published after clinical validation (V3 s.14).
 * Case questions are stored with context='case' and is_active=false, so they never enter
 * practice or mock-exam pools. --replace re-imports a case that has no student attempts.
 * Staging only; prod gets cases through a reviewed port, like the question bank.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TAXONOMIES, validateCase, type CaseDoc } from "./lib/case-standard";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
if (!file) { console.error("usage: import-case.ts [--check] [--replace] <case.json>"); process.exit(2); }
const doc: CaseDoc = JSON.parse(readFileSync(resolve(file), "utf8"));

const problems = validateCase(doc);
if (problems.length) { console.error(`✗ ${doc.case_code ?? file}: ${problems.length} problem(s)`); problems.forEach(p => console.error("  - " + p)); process.exit(1); }
console.log(`✓ ${doc.case_code}: passes the case standard (${doc.questions.length} questions, ${doc.stages.length} stages)`);
if (args.includes("--check")) process.exit(0);

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING ?? "";
if (!url.includes("kwhaqhhwqykckarjbdod")) { console.error("Refusing: staging URL missing or not the staging project"); process.exit(1); }
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING!, { auth: { persistSession: false, autoRefreshToken: false } });
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const DIFFICULTY = { low: "easy", moderate: "medium", high: "hard" } as const;

async function main() {
  const domains = must(await db.from("domains").select("id, code"), "domains") as { id: number; code: string }[];
  const domainId = (code: string) => { const d = domains.find(x => x.code === code); if (!d) throw new Error(`unknown domain ${code}`); return d.id; };

  const existing = must(await db.from("case_studies").select("id").eq("case_code", doc.case_code).maybeSingle(), "lookup") as { id: string } | null;
  if (existing) {
    if (!args.includes("--replace")) throw new Error(`${doc.case_code} already exists; pass --replace to re-import it`);
    const { count } = await db.from("case_attempts").select("id", { count: "exact", head: true }).eq("case_study_id", existing.id);
    if (count) throw new Error(`${doc.case_code} has ${count} student attempt(s); refusing to replace it`);
    const links = must(await db.from("case_study_questions").select("question_id").eq("case_study_id", existing.id), "links") as { question_id: string }[];
    must(await db.from("case_studies").delete().eq("id", existing.id), "delete case");
    if (links.length) must(await db.from("questions").delete().in("id", links.map(l => l.question_id)), "delete case questions");
  }

  const cs = must(await db.from("case_studies").insert({
    case_code: doc.case_code, title: doc.title, objective: doc.objective, population: doc.population, setting: doc.setting,
    primary_condition: doc.primary_condition, endpoint: doc.endpoint, difficulty: doc.difficulty, domain_id: domainId(doc.primary_domain),
    clinical_scenario: doc.opening.narrative, pathophysiology: doc.pathophysiology, quality_report: doc.quality_report ?? null,
    source: doc.source, status: "in_review", is_active: false, validation_status: "pending",
  }).select("id").single(), "insert case") as { id: string };

  // Stage 0 is the opening scenario; doc.stages follow from 1.
  const stageRows = [{ case_study_id: cs.id, stage_order: 0, time_label: doc.opening.time_label, narrative: doc.opening.narrative, vitals: [], assessment: [], labs: [] },
    ...doc.stages.map((s, i) => ({ case_study_id: cs.id, stage_order: i + 1, time_label: s.time_label, narrative: s.narrative, vitals: s.vitals ?? [], assessment: s.assessment ?? [], labs: s.labs ?? [] }))];
  const stages = must(await db.from("case_stages").insert(stageRows).select("id, stage_order"), "insert stages") as { id: string; stage_order: number }[];
  const stageId = (key: string) => stages.find(s => s.stage_order === doc.stages.findIndex(x => x.key === key) + 1)!.id;

  for (const q of doc.questions) {
    const question = must(await db.from("questions").insert({
      body: q.stem, explanation: q.rationale_correct, domain_id: domainId(q.domain), cognitive_level: TAXONOMIES[q.taxonomy],
      difficulty: DIFFICULTY[doc.difficulty], question_type: "mcq", context: "case", is_active: false,
      is_ai_generated: doc.source.startsWith("ai"), source: `case:${doc.source}`, source_id: `case:${doc.case_code}:q${q.position}`, review_status: "pending",
    }).select("id").single(), `insert Q${q.position}`) as { id: string };
    const rat: Record<string, string> = { ...q.distractor_rationales, [q.correct[0]]: q.rationale_correct };
    must(await db.from("question_options").insert(q.options.map((o, i) => ({
      question_id: question.id, body: o.text, is_correct: q.correct.includes(o.label), rationale: rat[o.label], display_order: i + 1, distractor_type: q.option_types[o.label],
    }))), `insert Q${q.position} options`);
    must(await db.from("case_study_questions").insert({
      case_study_id: cs.id, question_id: question.id, display_order: q.position, stage_id: stageId(q.stage), cj_step: q.cj_step,
      meta: { ...q.meta, self_test: q.self_test, domain: q.domain, taxonomy: q.taxonomy, format: q.format ?? null },
    }), `link Q${q.position}`);
  }
  console.log(`Imported ${doc.case_code} to staging as in_review (case ${cs.id}). Review it at /teacher/case-studies.`);
}
main().catch(e => { console.error("FATAL:", e.message ?? e); process.exit(1); });
