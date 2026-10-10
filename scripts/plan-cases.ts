/**
 * NRG — plan the next batch of AI case studies, and report the case bank against V3's targets.
 *
 *   npx tsx scripts/plan-cases.ts --count 5 [--specialty MS] [--out content/case-studies/plans/plan-2026-10-10.json]
 *   npx tsx scripts/plan-cases.ts --report
 *
 * Planning writes one CASE_REQUEST (docs/phase-1/case-standard/CASE_REQUEST.md) per case: condition, population and
 * setting from content/case-studies/catalog.json (skipping conditions that already have a case), specialty by the
 * catalog's weights, difficulty rotated, primary domain alternating CDM/NP, and the Q7/Q8 extension domains chosen so the
 * bank moves toward V3 s.2.1 (NP 35, CDM 35, HPMW 10, others 5). Generator agents then write each case per
 * docs/phase-1/CASE_GEN_BRIEF.md. No model calls and no database access here.
 *
 * --report tallies question-level domain and taxonomy over every case JSON in content/case-studies (and drafts/).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CASE_BANK_TARGETS, type CaseDoc } from "./lib/case-standard";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = "content/case-studies";

type Entry = { condition: string; specialty: string; population: string; setting: string; endpoint: string };
const catalog = JSON.parse(readFileSync(join(ROOT, "catalog.json"), "utf8")) as { specialty_weights: Record<string, number>; conditions: Entry[] };

function loadCases(): CaseDoc[] {
  const files = [ROOT, join(ROOT, "drafts")].filter(existsSync)
    .flatMap(d => readdirSync(d).filter(f => f.endsWith(".json") && f !== "catalog.json").map(f => join(d, f)));
  return files.map(f => JSON.parse(readFileSync(f, "utf8"))).filter((d: CaseDoc) => d.case_code && Array.isArray(d.questions));
}
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

function tally(cases: CaseDoc[]) {
  const dom: Record<string, number> = {}, tax: Record<string, number> = {};
  for (const c of cases) for (const q of c.questions) { dom[q.domain] = (dom[q.domain] ?? 0) + 1; tax[q.taxonomy] = (tax[q.taxonomy] ?? 0) + 1; }
  return { dom, tax, n: cases.reduce((a, c) => a + c.questions.length, 0) };
}

function report() {
  const cases = loadCases();
  const { dom, tax, n } = tally(cases);
  console.log(`${cases.length} cases, ${n} questions`);
  console.log("Domain   have  target");
  for (const [k, t] of Object.entries(CASE_BANK_TARGETS.domain)) console.log(`  ${k.padEnd(5)} ${String(pct(dom[k] ?? 0, n)).padStart(4)}%  ${t}%`);
  console.log("Taxonomy have  target");
  for (const [k, t] of Object.entries(CASE_BANK_TARGETS.taxonomy)) console.log(`  ${k.padEnd(5)} ${String(pct(tax[k] ?? 0, n)).padStart(4)}%  ${t}%`);
}

function plan() {
  const count = Number(flag("count") ?? 5);
  const only = flag("specialty");
  const existing = loadCases();
  const used = new Set(existing.map(c => c.primary_condition.toLowerCase()));
  const pool = catalog.conditions.filter(c => !used.has(c.condition.toLowerCase()) && (!only || c.specialty === only));
  if (!pool.length) throw new Error("no unused conditions left in the catalog");

  // Specialty for each slot: largest remainder over the catalog weights, counting cases that already exist.
  const have: Record<string, number> = {};
  for (const c of existing) { const s = c.case_code.split("-")[1]; have[s] = (have[s] ?? 0) + 1; }
  const weights = only ? { [only]: 1 } : catalog.specialty_weights;
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0);
  const picks: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const total = existing.length + picks.length + 1;
    const avail = Object.keys(weights).filter(s => pool.some(p => p.specialty === s && !picks.includes(p)));
    if (!avail.length) break;
    const s = avail.sort((a, b) => (weights[b] / wsum) * total - (have[b] ?? 0) - ((weights[a] / wsum) * total - (have[a] ?? 0)))[0];
    picks.push(pool.find(p => p.specialty === s && !picks.includes(p))!);
    have[s] = (have[s] ?? 0) + 1;
  }

  // Extension domains: the minor domains, weighted by their targets, minus what the bank already has.
  const minor = ["HPMW", "NLM", "COM", "PC", "PD"] as const;
  const { dom } = tally(existing);
  const ext: string[] = [];
  const extCount = (d: string) => (dom[d] ?? 0) + ext.filter(x => x === d).length;
  for (let i = 0; i < picks.length * 2; i++) {
    const d = [...minor].sort((a, b) => extCount(a) / CASE_BANK_TARGETS.domain[a] - extCount(b) / CASE_BANK_TARGETS.domain[b])[0];
    ext.push(d);
  }

  const nextNum = (spec: string, k: number) => {
    const nums = existing.map(c => c.case_code).filter(c => c.startsWith(`NRG-${spec}-`)).map(c => Number(c.split("-")[2]) || 0);
    return `NRG-${spec}-${String(Math.max(0, ...nums) + 1 + k).padStart(3, "0")}`;
  };
  const difficulties = ["moderate", "high", "moderate", "low"];
  const seen: Record<string, number> = {};
  const requests = picks.map((p, i) => {
    seen[p.specialty] = (seen[p.specialty] ?? 0) + 1;
    return {
      case_code: nextNum(p.specialty, seen[p.specialty] - 1),
      objective: "",
      patient_setting: `${p.population}, ${p.setting}, Caribbean`,
      primary_condition: p.condition,
      endpoint: p.endpoint,
      primary_domain: (existing.length + i) % 2 === 0 ? "CDM" : "NP",
      target_taxonomy: "ASE for Q3 and Q6; AP or ASE elsewhere; at most one KC item",
      q7_domain: ext[i * 2],
      q8_domain: ext[i * 2 + 1],
      difficulty: difficulties[(existing.length + i) % difficulties.length],
      draft_path: `${ROOT}/drafts/${nextNum(p.specialty, seen[p.specialty] - 1)}.json`,
    };
  });
  const out = flag("out") ?? `${ROOT}/plans/plan-${new Date().toISOString().slice(0, 10)}.json`;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify({ created_at: new Date().toISOString(), requests }, null, 2) + "\n");
  console.log(`Wrote ${out}:`);
  for (const r of requests) console.log(`  ${r.case_code}  ${r.primary_condition} · ${r.patient_setting} · ${r.primary_domain} · Q7 ${r.q7_domain}, Q8 ${r.q8_domain} · ${r.difficulty}`);
}

if (args.includes("--report")) report(); else plan();
