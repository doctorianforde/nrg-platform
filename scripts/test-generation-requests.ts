/**
 * Offline tests for generation requests (src/lib/generation/) and the CLI that runs them. No network, no database:
 * the CLI legs use --no-db and the mock provider, and write only to a temp directory.
 *
 *   npx tsx scripts/test-generation-requests.ts
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyInterpretation, heuristicInterpret, matchTopics, parseInterpretation, type TopicRow } from "../src/lib/generation/interpret";
import { apportion, buildMcqPlan } from "../src/lib/generation/plan";
import { readyToRun, validateRequest, type GenerationRequest, type McqSelections } from "../src/lib/generation/request";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`); };
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const errs = (raw: unknown) => { const v = validateRequest(raw); return v.ok ? [] : v.errors; };

// ─── validation ─────────────────────────────────────────────────────────────
t("auto mcq with blueprint defaults is valid", validateRequest({ kind: "mcq", mode: "auto", count: 20, selections: {} }).ok);
t("unknown kind rejected", errs({ kind: "flashcards", mode: "auto", count: 5 }).length === 1);
t("unknown domain code rejected", errs({ kind: "mcq", mode: "auto", count: 5, selections: { domains: ["NP", "XX"] } }).some(e => e.includes("XX")));
t("percentages must sum to 100", errs({ kind: "mcq", mode: "auto", count: 5, selections: { taxonomy: { AP: 50, ASE: 30 } } }).some(e => e.includes("sum to 100")));
t("empty list rejected", errs({ kind: "mcq", mode: "auto", count: 5, selections: { clusters: [] } }).length > 0);
t("count above the kind's cap rejected", errs({ kind: "case_study", mode: "auto", count: 11 }).length > 0);
t("auto mode needs a count", errs({ kind: "mcq", mode: "auto" }).length > 0);
t("prompted mode needs a prompt", errs({ kind: "mcq", mode: "prompted", count: 5 }).some(e => e.includes("prompt")));
t("prompted mode may leave count to the prompt", validateRequest({ kind: "mcq", mode: "prompted", prompt: "10 questions on asthma" }).ok);
t("topic with a bad cluster rejected", errs({ kind: "mcq", mode: "auto", count: 5, selections: { topics: [{ name: "X", cluster: "NOPE" }] } }).length > 0);
t("unknown case specialty rejected", errs({ kind: "case_study", mode: "auto", count: 2, selections: { specialties: ["ZZ"] } }).length > 0);
{
  const v = validateRequest({ kind: "mcq", mode: "prompted", count: 5, prompt: "x" });
  t("prompted request not ready until interpreted", v.ok && readyToRun(v.request) !== null);
}

// ─── planning ───────────────────────────────────────────────────────────────
{
  const p = buildMcqPlan(37);
  t("default plan: exact totals on every axis", sum(p.dCounts) === 37 && sum(p.tCounts) === 37 && sum(p.cCounts) === 37 && p.specs.length === 37);
  t("default plan: blueprint domain shares (NP 11 of 37)", p.dCounts.NP === 11 && p.dCounts.PD === 2);
  t("apportion gives zero-weight codes nothing", apportion(7, [{ code: "A", pct: 1 }, { code: "B", pct: 0 }, { code: "C", pct: 1 }]).B === 0);
}
{
  const p = buildMcqPlan(10, { domains: ["CDM", "NLM"], taxonomy: ["ASE"] });
  t("domain list: only the chosen domains, split evenly", p.dCounts.CDM === 5 && p.dCounts.NLM === 5 && p.specs.every(s => ["CDM", "NLM"].includes(s.domain)));
  t("taxonomy list: every item ASE", p.specs.every(s => s.taxonomy === "ASE"));
}
{
  const sel: McqSelections = { topics: [{ id: 1, name: "Postpartum", cluster: "MATCHILD" }, { id: 2, name: "Delegation", cluster: "MGMT" }, { name: "Free text topic" }] };
  const p = buildMcqPlan(8, sel);
  t("topics spread 3/3/2 across 8 items", JSON.stringify(Object.values(p.topicCounts!).sort()) === JSON.stringify([2, 3, 3]));
  t("each topic item takes its topic's cluster", p.specs.filter(s => s.topic?.name === "Postpartum").every(s => s.cluster === "MATCHILD") && p.specs.filter(s => s.topic?.name === "Delegation").every(s => s.cluster === "MGMT"));
  t("cluster counts still total the item count", sum(p.cCounts) === 8);
}
{
  const p = buildMcqPlan(9, { difficulty: { hard: 100 } });
  t("difficulty record honoured", p.specs.every(s => s.difficulty === "hard"));
  t("difficulty dropped when the rules switch says so", buildMcqPlan(9, { difficulty: ["hard"] }, { withDifficulty: false }).specs.every(s => !s.difficulty));
}

// ─── heuristic interpreter ──────────────────────────────────────────────────
const TOPICS: TopicRow[] = [
  { id: 11, name: "Postpartum", cluster: "MATCHILD" }, { id: 12, name: "Postpartum — haemorrhage", cluster: "MATCHILD" },
  { id: 13, name: "Delegation", cluster: "MGMT" }, { id: 14, name: "Trauma", cluster: "MEDSURG" }, { id: 15, name: "Trauma — head injury", cluster: "MEDSURG" },
];
{
  const r = heuristicInterpret("mcq", "Give me 15 hard analysis questions on postpartum haemorrhage for the CDM domain", { topics: TOPICS });
  const s = r.selections as McqSelections;
  t("reads count", r.count === 15, String(r.count));
  t("reads taxonomy ASE", JSON.stringify(s.taxonomy) === '["ASE"]', JSON.stringify(s.taxonomy));
  t("reads difficulty hard", JSON.stringify(s.difficulty) === '["hard"]');
  t("reads domain code", JSON.stringify(s.domains) === '["CDM"]');
  t("most specific topic wins (haemorrhage over Postpartum)", s.topics?.length === 1 && s.topics[0].id === 12, JSON.stringify(s.topics));
  t("no conflicts for an in-scope prompt", r.conflicts.length === 0, r.conflicts.join("; "));
}
{
  const r = heuristicInterpret("mcq", "twenty select all that apply questions about ICU ventilator care with glucose in mmol/L", { topics: TOPICS });
  t("number words read", r.count === 20, String(r.count));
  t("flags SATA, critical care and mmol/L glucose", r.conflicts.length === 3, r.conflicts.join(" | "));
}
t("count capped at the kind's maximum", heuristicInterpret("mcq", "500 questions on delegation").count === 200);
t("topic match is whole-word", matchTopics("traumatic stress", TOPICS).length === 0);
{
  // Shapes seen in the staging topic list: a parent inside a longer subtopic phrase, and near-duplicate topics.
  const live: TopicRow[] = [{ id: 1, name: "Postpartum", cluster: "MATCHILD" }, { id: 2, name: "Obstetric emergencies — postpartum haemorrhage", cluster: "MATCHILD" },
    { id: 3, name: "Head Injury", cluster: "MEDSURG" }, { id: 4, name: "Trauma — head injury", cluster: "MEDSURG" }, { id: 5, name: "Trauma", cluster: "MEDSURG" }];
  const ids = matchTopics("analysis questions on postpartum haemorrhage and head injury", live).map(x => x.id).sort();
  t("one topic per phrase: no parent, no near-duplicate", JSON.stringify(ids) === "[2,3]", JSON.stringify(ids));
  t("separate phrases still give separate topics", matchTopics("postpartum care and trauma", live).length === 2);
}
{
  const r = heuristicInterpret("case_study", "Two challenging maternal cases on pre-eclampsia with a delegation question (NLM)", { caseConditions: ["Pre-eclampsia", "Asthma exacerbation"] });
  const s = r.selections as { specialties?: string[]; conditions?: string[]; difficulty?: string[]; extension_domains?: string[] };
  t("case: count, specialty, condition, difficulty, extension domain", r.count === 2 && s.specialties?.join() === "OB" && s.conditions?.join() === "Pre-eclampsia" && s.difficulty?.join() === "high" && s.extension_domains?.join() === "NLM", JSON.stringify(r));
}

// ─── model / agent interpretation ───────────────────────────────────────────
{
  const r = parseInterpretation("mcq", { count: 12, selections: { taxonomy: ["AP"], topic_phrases: ["head injury", "volcanic ash lung"], difficulty: null }, notes: ["x"] }, { topics: TOPICS });
  const s = r.selections as McqSelections;
  t("agent topic phrase resolved to the subtopic", s.topics?.length === 1 && s.topics[0].id === 15, JSON.stringify(s.topics));
  t("unmatched topic phrase kept as guidance", r.unresolved.some(u => u.includes("volcanic")));
  let threw = false; try { parseInterpretation("mcq", { selections: { domains: ["ICU"] } }); } catch { threw = true; }
  t("agent interpretation with a bad code is rejected", threw);
  const req = validateRequest({ kind: "mcq", mode: "prompted", prompt: "x", selections: { domains: ["PC"] } });
  const merged = req.ok ? applyInterpretation(req.request, r, "test") : null;
  t("explicit selections beat the interpretation; count filled from it", !!merged && merged.count === 12 && JSON.stringify((merged.selections as McqSelections).domains) === '["PC"]' && merged.interpretation?.confirmed === false);
}

// ─── CLI end to end (mock provider, temp files) ─────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "nrg-genreq-"));
const cli = (...a: string[]) => spawnSync("npx", ["tsx", "scripts/generation-request.ts", ...a], { encoding: "utf8" });
try {
  const req = join(dir, "req.json");
  let r = cli("new", "--kind", "mcq", "--mode", "prompted", "--prompt", "Write 6 application questions on delegation, mostly medium difficulty", "--out", req, "--no-db");
  t("cli new (prompted)", r.status === 0, r.stderr);
  r = cli("run", req, "--", "--provider", "mock");
  t("cli run refuses an uninterpreted prompted request", r.status !== 0 && /not ready/i.test(r.stderr + r.stdout));
  r = cli("interpret", req, "--no-db");
  const interpreted = JSON.parse(readFileSync(req, "utf8")) as GenerationRequest;
  t("cli interpret (heuristic) fills count and taxonomy", r.status === 0 && interpreted.count === 6 && JSON.stringify((interpreted.selections as McqSelections).taxonomy) === '["AP"]', r.stderr + JSON.stringify(interpreted));
  r = cli("run", req, "--", "--provider", "mock");
  t("cli run refuses before confirmation", r.status !== 0);
  r = cli("confirm", req);
  const out = join(dir, "items.json");
  r = cli("run", req, "--", "--provider", "mock", "--out", out);
  const gen = r.status === 0 ? JSON.parse(readFileSync(out, "utf8")) : null;
  t("cli run (mock) writes 6 items, all AP, request recorded", !!gen && gen.items.length === 6 && gen.items.every((i: { taxonomy: string }) => i.taxonomy === "AP") && gen.request?.mode === "prompted", r.stderr.slice(-400));
  const brief = join(dir, "brief.md");
  r = cli("run", req, "--", "--prompt-out", brief);
  const text = r.status === 0 ? readFileSync(brief, "utf8") : "";
  t("agent brief carries Jade's prompt below the standard's precedence note", text.includes("TEACHER'S REQUEST") && text.includes("Write 6 application questions on delegation") && text.indexOf("TEACHER'S REQUEST") < text.indexOf("MCQ AUTHORING STANDARD"));

  const auto = join(dir, "auto.json");
  r = cli("new", "--kind", "mcq", "--mode", "auto", "--count", "4", "--topics", "Delegation;A brand new topic", "--difficulty", "hard", "--out", auto, "--no-db");
  const out2 = join(dir, "items2.json");
  const r2 = cli("run", auto, "--", "--provider", "mock", "--out", out2);
  const gen2 = r2.status === 0 ? JSON.parse(readFileSync(out2, "utf8")) : null;
  t("auto mode: topics and difficulty reach every item", !!gen2 && gen2.items.length === 4 && gen2.items.every((i: { topic: string; difficulty: string }) => ["Delegation", "A brand new topic"].includes(i.topic) && i.difficulty === "hard"), r.stderr + r2.stderr.slice(-400));

  const cases = join(dir, "cases.json");
  writeFileSync(cases, JSON.stringify({ kind: "case_study", mode: "prompted", count: 2, prompt: "Two OB cases, one on a condition we have not covered",
    selections: { specialties: ["OB"], conditions: ["Sickle cell crisis in pregnancy"], difficulty: ["high"], extension_domains: ["NLM", "COM"] },
    interpretation: { by: "test", at: "2026-10-20T00:00:00Z", notes: [], conflicts: [], unresolved: [], confirmed: true } }));
  const planOut = join(dir, "plan.json");
  r = cli("run", cases, "--", "--out", planOut);
  const plan = r.status === 0 ? JSON.parse(readFileSync(planOut, "utf8")) : null;
  const reqs = plan?.requests ?? [];
  t("case plan: free-text condition first, OB only, high, NLM/COM extensions, teacher_request on each",
    reqs.length === 2 && reqs[0].primary_condition === "Sickle cell crisis in pregnancy" && reqs.every((x: Record<string, string>) => x.case_code.startsWith("NRG-OB-") && x.difficulty === "high" && x.q7_domain === "NLM" && x.q8_domain === "COM" && x.teacher_request?.startsWith("Two OB cases")),
    r.stderr + JSON.stringify(reqs));
  t("case plan: distinct case codes", new Set(reqs.map((x: { case_code: string }) => x.case_code)).size === reqs.length);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
t("no stray files left in data/generated by the mock runs", !readdirSync("data/generated").some(f => f.startsWith("generated-set-")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
