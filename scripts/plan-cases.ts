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
 * --request <file> plans from a generation request (kind "case_study", src/lib/generation/request.ts) instead of
 * --count/--specialty: its specialties, conditions (catalog or free text), population, setting, difficulty, primary and
 * Q7/Q8 domains constrain the plan, and Jade's prompt rides along on every CASE_REQUEST as `teacher_request`.
 * Prompted requests must be interpreted and confirmed first (scripts/generation-request.ts).
 *
 * --report tallies question-level domain and taxonomy over every case JSON in content/case-studies (and drafts/).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CASE_BANK_TARGETS, type CaseDoc } from "./lib/case-standard";
import { readyToRun, validateRequest, type CaseRequest } from "../src/lib/generation/request";

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

function loadRequest(p: string): CaseRequest {
  const v = validateRequest(JSON.parse(readFileSync(resolve(p), "utf8")));
  if (!v.ok) throw new Error(`invalid request ${p}: ${v.errors.join("; ")}`);
  if (v.request.kind !== "case_study") throw new Error(`${p} is a ${v.request.kind} request; this script plans case studies`);
  const blocked = readyToRun(v.request);
  if (blocked) throw new Error(`request not ready: ${blocked}`);
  v.warnings.forEach(w => console.log(`  ! request: ${w}`));
  return v.request;
}

function plan() {
  const req = flag("request") ? loadRequest(flag("request")!) : undefined;
  const sel = req?.selections ?? {};
  const count = req?.count ?? Number(flag("count") ?? 5);
  const specialties = sel.specialties ?? (flag("specialty") ? [flag("specialty")!] : undefined);
  const existing = loadCases();
  const used = new Set(existing.map(c => c.primary_condition.toLowerCase()));
  const named = (sel.conditions ?? []).slice(0, count);
  for (const c of named) if (used.has(c.toLowerCase())) console.log(`  ! "${c}" already has a case; planning another one as asked`);
  // Named conditions come first: the catalog entry when there is one, else a free-text entry the author fills in.
  const fixed: Entry[] = named.map(c => {
    const hit = catalog.conditions.find(x => x.condition.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
    const s = specialties?.[0];
    if (!s) throw new Error(`"${c}" is not in the catalog: give a specialty (${Object.keys(catalog.specialty_weights).join(", ")}) in the request`);
    return { condition: c, specialty: s, population: sel.population ?? "", setting: sel.setting ?? "", endpoint: "" };
  });
  const pool = catalog.conditions.filter(c => !used.has(c.condition.toLowerCase()) && !fixed.includes(c) && (!specialties || specialties.includes(c.specialty)));
  if (!pool.length && fixed.length < count) throw new Error("no unused conditions left in the catalog for this request");

  // Specialty for each slot: largest remainder over the catalog weights, counting cases that already exist.
  const have: Record<string, number> = {};
  for (const c of existing) { const s = c.case_code.split("-")[1]; have[s] = (have[s] ?? 0) + 1; }
  const weights = specialties ? Object.fromEntries(specialties.map(s => [s, catalog.specialty_weights[s] ?? 1])) : catalog.specialty_weights;
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0);
  const picks: Entry[] = [...fixed];
  for (const p of fixed) have[p.specialty] = (have[p.specialty] ?? 0) + 1;
  for (let i = fixed.length; i < count; i++) {
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
    if (sel.extension_domains?.length) { ext.push(sel.extension_domains[i % sel.extension_domains.length]); continue; }
    const d = [...minor].sort((a, b) => extCount(a) / CASE_BANK_TARGETS.domain[a] - extCount(b) / CASE_BANK_TARGETS.domain[b])[0];
    ext.push(d);
  }

  const nextNum = (spec: string, k: number) => {
    const nums = existing.map(c => c.case_code).filter(c => c.startsWith(`NRG-${spec}-`)).map(c => Number(c.split("-")[2]) || 0);
    return `NRG-${spec}-${String(Math.max(0, ...nums) + 1 + k).padStart(3, "0")}`;
  };
  const difficulties = sel.difficulty ?? ["moderate", "high", "moderate", "low"];
  const primaries = sel.primary_domains ?? ["CDM", "NP"];
  const seen: Record<string, number> = {};
  const requests = picks.map((p, i) => {
    seen[p.specialty] = (seen[p.specialty] ?? 0) + 1;
    return {
      case_code: nextNum(p.specialty, seen[p.specialty] - 1),
      objective: "",
      patient_setting: [sel.population ?? p.population, sel.setting ?? p.setting, "Caribbean"].filter(Boolean).join(", "),
      primary_condition: p.condition,
      endpoint: p.endpoint || "author's choice: a realistic endpoint for this condition",
      primary_domain: primaries[(existing.length + i) % primaries.length],
      target_taxonomy: "ASE for Q3 and Q6; AP or ASE elsewhere; at most one KC item",
      q7_domain: ext[i * 2],
      q8_domain: ext[i * 2 + 1],
      difficulty: difficulties[(existing.length + i) % difficulties.length],
      draft_path: `${ROOT}/drafts/${nextNum(p.specialty, seen[p.specialty] - 1)}.json`,
      ...(req?.prompt ? { teacher_request: req.prompt } : {}),
    };
  });
  const out = flag("out") ?? `${ROOT}/plans/plan-${new Date().toISOString().slice(0, 10)}.json`;
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify({ created_at: new Date().toISOString(), ...(req ? { generation_request: req } : {}), requests }, null, 2) + "\n");
  console.log(`Wrote ${out}:`);
  for (const r of requests) console.log(`  ${r.case_code}  ${r.primary_condition} · ${r.patient_setting} · ${r.primary_domain} · Q7 ${r.q7_domain}, Q8 ${r.q8_domain} · ${r.difficulty}`);
}

if (args.includes("--report")) report(); else plan();
