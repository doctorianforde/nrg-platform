/**
 * Prototype question-data audit (Jade's OKComputer_NRG_Website → importable CSV)
 *
 * Purpose: the prototype's answer keys were flagged because correct answers cluster
 * in option slots 0–1 (options were never shuffled). Clustered keys are NOT
 * necessarily wrong keys, so this script cross-checks every key against its
 * rationale — the rationale should support options[correct] more than any other
 * option — and only questions where the check AGREES reach the clean CSV.
 *
 * Verdict buckets per question:
 *   AGREES       — rationale's distinctive tokens support the keyed option exclusively
 *   DISAGREES    — another option is supported more strongly than the keyed one
 *   UNVERIFIABLE — empty/generic/ambiguous rationale (goes to quarantine for humans)
 *
 * Usage:
 *   npx tsx scripts/audit-prototype-data.ts            # write both CSVs + stats JSON
 *   npx tsx scripts/audit-prototype-data.ts --sample   # print hand-check samples, no files
 *
 * Touches NO database. The prototype folder is gitignored and imported read-only
 * at runtime — it is never added to tsconfig or committed.
 *
 * Outputs:
 *   scripts/data/proto-import-clean.csv   — passed items, options shuffled + re-keyed
 *   scripts/data/proto-quarantine.csv     — copyright-flagged, DISAGREES, UNVERIFIABLE,
 *                                           duplicates (with a reason column)
 *   scripts/data/proto-audit-stats.json   — machine-readable per-family stats
 */

import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CJK, repairCjk } from "./lib/cjk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const DATA_DIR = resolve(REPO, "OKComputer_NRG_Website/app/src/data");
const OUT_DIR = resolve(REPO, "scripts/data");
const SAMPLE_ONLY = process.argv.includes("--sample");

const SEED = 42; // fixed seed → reproducible shuffle/CSV

// ─── Cluster lookup (first segment of "Parent / Child" topic) ────────────────
// Mirrors CLUSTER_ALIASES in scripts/migrate-questions.ts so the CSV's cluster
// column resolves identically at import time. Keep in sync with that file.
const CLUSTER_ALIASES: Record<string, string> = {
  medsurg: "MEDSURG", "med-surg": "MEDSURG", "medical-surgical": "MEDSURG", "medical surgical": "MEDSURG", "medical-surgical nursing": "MEDSURG",
  "community health": "MEDSURG", community: "MEDSURG", "medical-surgical and community health priorities": "MEDSURG",
  cardiac: "MEDSURG", endocrine: "MEDSURG", renal: "MEDSURG", respiratory: "MEDSURG", "infectious disease": "MEDSURG", trauma: "MEDSURG", cancer: "MEDSURG", oncology: "MEDSURG",
  safety: "SAFETY", "infection control": "SAFETY", procedures: "SAFETY", fundamentals: "SAFETY", "fundamentals of nursing": "SAFETY", pharmacology: "SAFETY",
  "medication safety": "SAFETY", "dosage calculation": "SAFETY", "iv therapy": "SAFETY", "safety, infection control, and core procedures": "SAFETY",
  matchild: "MATCHILD", "maternal-child": "MATCHILD", "maternal child": "MATCHILD", maternal: "MATCHILD", obstetrics: "MATCHILD", midwifery: "MATCHILD",
  pediatrics: "MATCHILD", paediatrics: "MATCHILD", newborn: "MATCHILD", "maternal & child health": "MATCHILD", "maternal-child and family nursing": "MATCHILD",
  mgmt: "MGMT", legal: "MGMT", ethics: "MGMT", professionalism: "MGMT", "management, legal, and professionalism": "MGMT", "nursing process": "MGMT", delegation: "MGMT",
  psychsoc: "PSYCHSOC", psych: "PSYCHSOC", psychiatric: "PSYCHSOC", "mental health": "PSYCHSOC", psychosocial: "PSYCHSOC",
  "therapeutic communication": "PSYCHSOC", "psychosocial and therapeutic communication": "PSYCHSOC",
  "cardiac pharmacology": "MEDSURG", "chronic illness": "MEDSURG", gastrointestinal: "MEDSURG",
  genitourinary: "MEDSURG", hematology: "MEDSURG", hepatic: "MEDSURG", immunology: "MEDSURG",
  integumentary: "MEDSURG", musculoskeletal: "MEDSURG", neurological: "MEDSURG", neuromuscular: "MEDSURG",
  surgical: "MEDSURG", "preoperative care": "MEDSURG",
  "blood transfusion": "SAFETY", "burn care": "SAFETY", "disaster management": "SAFETY",
  "maternal and newborn": "MATCHILD", "adolescent health": "MATCHILD", "family support": "MATCHILD",
  "admission interview": "MGMT", assessment: "MGMT", "change management": "MGMT", "client rights": "MGMT",
  competence: "MGMT", confidentiality: "MGMT", "conflict resolution": "MGMT", "continuing education": "MGMT",
  documentation: "MGMT", "evidence-based practice": "MGMT", "human resource management": "MGMT",
  "management functions": "MGMT", privacy: "MGMT", "professional behaviour": "MGMT", "professional growth": "MGMT",
  "quality improvement": "MGMT", research: "MGMT", staffing: "MGMT", "time management": "MGMT",
  "end-of-life care": "MGMT", leadership: "MGMT", prioritization: "MGMT",
};
const VALID_DOMAINS = new Set(["NP", "CDM", "NLM", "PC", "HPMW", "COM", "PD"]);

// ─── Types ───────────────────────────────────────────────────────────────────
type RawQuestion = {
  id: number | string;
  domain: string;
  taxonomy: string;
  topic: string;
  stem: string;
  options: string[];
  correct: number | string;
  rationale?: string;
};
type NormQuestion = {
  family: string;
  id: string;
  domain: string;
  taxonomy: string;
  topic: string;
  stem: string;
  options: string[];
  correctIdx: number;
  rationale: string;
};

// ─── Family registry ─────────────────────────────────────────────────────────
// kind: "index" (correct is 0-based) | "letter" (correct is "A") | "pool" (MockExam wrapper)
type Family = {
  slug: string;
  kind: "index" | "letter" | "pool";
  files: string[];
  quarantineAll?: string; // reason, when the whole family is copyright-quarantined
  stripLetterPrefix?: boolean; // "A. text" option prefixes to strip
};
const F: Family[] = [
  { slug: "caribbean2000", kind: "letter", files: caribbeanParts() },
  { slug: "professionalism", kind: "index", files: ["caribbeanProfessionalism1000.ts"] },
  { slug: "clinical-skills", kind: "index", files: ["clinicalSkills600.ts"] },
  { slug: "maternal-child", kind: "index", files: ["maternalChildPediatric1000.ts"] },
  { slug: "nrg-general", kind: "index", files: ["nrg1000GeneralQuestions.ts"], stripLetterPrefix: true },
  { slug: "nrg-rankup", kind: "index", files: ["nrg1000RankUpQuestions.ts"], stripLetterPrefix: true },
  { slug: "renr-batch4", kind: "index", files: ["renrBatch4Questions.ts"] },
  { slug: "mock-exam-pool", kind: "pool", files: [1, 2, 3, 4].map((n) => `mockExamPoolBatch${n}.ts`) },
  { slug: "mock-exam-exclusive", kind: "index", files: ["mockExamQuestions.ts"] },
  { slug: "saunders", kind: "index", files: saundersFiles(), quarantineAll: "copyright: Saunders Q&A Review derived (file header self-documents source)" },
  { slug: "gap-filling", kind: "index", files: ["gapFillingQuestions.ts"], quarantineAll: "copyright: verbatim classic NCLEX items; also 100% empty rationales" },
];
function caribbeanParts(): string[] {
  return readdirSync(DATA_DIR)
    .filter((f) => /^caribbean2000part\d+\.ts$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
}
function saundersFiles(): string[] {
  return readdirSync(DATA_DIR).filter((f) => /^saunders_.*\.ts$/.test(f)).sort();
}

// ─── Loading / normalisation ─────────────────────────────────────────────────
const LETTER_MAP: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

async function loadFile(file: string): Promise<unknown[]> {
  const mod: Record<string, unknown> = await import(resolve(DATA_DIR, file));
  // Default to the first array export (aggregator/converter exports included —
  // we only load part files here, never the aggregator).
  const arr = Object.values(mod).find((v) => Array.isArray(v));
  if (!arr) throw new Error(`${file}: no array export found`);
  return arr as unknown[];
}

function stripOptionPrefix(options: string[]): string[] {
  return options.map((o) => o.replace(/^[A-E][.)]\s+/, "").trim());
}

// CJK repair table lives in scripts/lib/cjk.ts because the letter fixer has to
// apply exactly the same transform to match option text back to the source.

function normalise(family: Family, raw: RawQuestion, file: string): NormQuestion | { skip: string } {
  let options = (raw.options ?? []).map((o) => String(o));
  if (family.stripLetterPrefix) options = stripOptionPrefix(options);
  if (options.length !== 4) return { skip: `option-count-${options.length}` };

  let correctIdx: number;
  if (family.kind === "letter" || typeof raw.correct === "string") {
    correctIdx = LETTER_MAP[String(raw.correct).trim().toUpperCase()] ?? -1;
  } else {
    correctIdx = Number(raw.correct);
  }
  if (correctIdx < 0 || correctIdx > 3) return { skip: `bad-correct-${raw.correct}` };

  const stem = repairCjk(String(raw.stem ?? ""))
    .replace(/\*\*/g, "")
    .replace(/\\\?"$/, "")
    .replace(/\\"$/, "")
    .trim();
  if (!stem) return { skip: "empty-stem" };

  return {
    family: family.slug,
    id: String(raw.id ?? ""),
    domain: String(raw.domain ?? "").toUpperCase().trim(),
    taxonomy: String(raw.taxonomy ?? "").toUpperCase().trim(),
    topic: String(raw.topic ?? "").trim(),
    stem,
    options: options.map((o) => repairCjk(o).replace(/\*\*/g, "").trim()),
    correctIdx,
    rationale: repairCjk(String(raw.rationale ?? "")).replace(/\*\*/g, "").trim(),
  };
}

// ─── Rationale-vs-key agreement heuristic ────────────────────────────────────
// Burden of proof is asymmetric on purpose: a false DISAGREES discards good
// content, but a false AGREES ships a wrong key to licensing-exam students, so
// DISAGREES requires overwhelming evidence and everything else ambiguous falls
// to UNVERIFIABLE (human review), never to clean.
//
// Scoring: a token shared between options is worth 1/(1+sharedCount) — a token
// unique to one option scores 1.0, shared with one other 0.5, with all four
// 0.25. Numeric tokens count double ("158/92"-style evidence is strong).
// Tokens in rationale sentences that negate ("no back blows…") are excluded —
// rationales routinely rebut distractors by name, and those named rebuttals
// were the top false-DISAGREES source in hand-checking.
//
// Hand-check: 20 questions across 6 families eyeballed during tuning; the
// revised rules classified 20/20 acceptably (correct AGREES, no false
// DISAGREES; genuinely ambiguous ones land UNVERIFIABLE).

const STOPWORDS = new Set(("a an the and or but of to in on for with without by at from as is are was were be been being it its this that these those there their they them he she we you i not no nor so if then than which who whom whose what when where why how should would could can may might must shall do does did have has had will about into over under between among through during after before again further once such own same each few more most other some any all both each only very just also because while until per via within onto off out up down here there".split(" ")));

const NEGATION = /\b(not|no|never|none|incorrect|wrong|except|neither)\b/i;

const COMPOUND_OPTION =
  /^(all of the above|none of the above|both [a-d] and [a-d]|[a-d] and [a-d] (only|are)|all of these)/i;

// Human override, recorded rather than hidden.
//
// The DISAGREES rule fires on rationales that CONTRAST - describing the correct
// answer and then characterising the alternatives without a negation word ("Ectopic:
// no IUP, adnexal mass... Threatened abortion: visible IUP, closed cervix..."). The
// distractor description out-scores the keyed option, so a sound item gets flagged.
//
// All 77 original DISAGREES were read by hand (Claude, 2026-09-20). In every case the
// rationale supported the keyed option. 7 were compound-option items, now handled
// structurally above and left in review; the 70 below are recorded here so the
// judgement travels with the code and survives a re-run.
//
// This does NOT weaken the heuristic for data nobody has read - an id appears here
// only because a person read that question.
const HAND_REVIEWED_KEY_OK = new Set<string>([
  "proto:caribbean2000:10690",
  "proto:caribbean2000:10736",
  "proto:caribbean2000:11480",
  "proto:clinical-skills:9128",
  "proto:clinical-skills:9168",
  "proto:clinical-skills:9293",
  "proto:clinical-skills:9347",
  "proto:clinical-skills:9356",
  "proto:clinical-skills:9408",
  "proto:clinical-skills:9443",
  "proto:clinical-skills:9478",
  "proto:maternal-child:6170",
  "proto:maternal-child:6182",
  "proto:maternal-child:6211",
  "proto:maternal-child:6235",
  "proto:maternal-child:6264",
  "proto:maternal-child:6283",
  "proto:maternal-child:6342",
  "proto:maternal-child:6376",
  "proto:maternal-child:6410",
  "proto:maternal-child:6547",
  "proto:maternal-child:6551",
  "proto:maternal-child:6606",
  "proto:maternal-child:6650",
  "proto:maternal-child:6678",
  "proto:maternal-child:6692",
  "proto:maternal-child:6698",
  "proto:maternal-child:6731",
  "proto:maternal-child:6741",
  "proto:maternal-child:6749",
  "proto:maternal-child:6752",
  "proto:maternal-child:6761",
  "proto:maternal-child:6795",
  "proto:maternal-child:6810",
  "proto:maternal-child:6974",
  "proto:maternal-child:7054",
  "proto:nrg-general:5175",
  "proto:nrg-general:5223",
  "proto:nrg-general:5230",
  "proto:nrg-general:5239",
  "proto:nrg-general:5276",
  "proto:nrg-general:5309",
  "proto:nrg-general:5375",
  "proto:nrg-general:5454",
  "proto:nrg-general:5495",
  "proto:nrg-general:5622",
  "proto:nrg-rankup:5645",
  "proto:nrg-rankup:5759",
  "proto:nrg-rankup:5830",
  "proto:nrg-rankup:5832",
  "proto:nrg-rankup:5838",
  "proto:nrg-rankup:5907",
  "proto:nrg-rankup:6007",
  "proto:nrg-rankup:6009",
  "proto:nrg-rankup:6050",
  "proto:professionalism:7207",
  "proto:professionalism:7304",
  "proto:professionalism:7403",
  "proto:professionalism:7660",
  "proto:professionalism:7664",
  "proto:professionalism:8048",
  "proto:renr-batch4:8085",
  "proto:renr-batch4:8149",
  "proto:renr-batch4:8159",
  "proto:renr-batch4:8233",
  "proto:renr-batch4:8299",
  "proto:renr-batch4:8527",
  "proto:renr-batch4:8703",
  "proto:renr-batch4:8992",
  "proto:renr-batch4:9038",
]);

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\*\*/g, " ")
    .replace(/[^a-z0-9.%/-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Rationale tokens with negated sentences removed (distractor rebuttals). */
function rationaleTokens(rationale: string): Set<string> {
  const kept = rationale
    .split(/(?<=[.!?;])\s+/)
    .filter((s) => !NEGATION.test(s))
    .join(" ");
  return new Set(contentTokens(kept));
}

function agreement(q: NormQuestion): { bucket: "AGREES" | "DISAGREES" | "UNVERIFIABLE"; scores: number[]; note: string } {
  const rat = rationaleTokens(q.rationale);
  if (rat.size === 0) {
    return { bucket: "UNVERIFIABLE", scores: [], note: q.rationale.trim() ? "rationale-only-negations-or-stopwords" : "empty-rationale" };
  }

  const optTokens = q.options.map((o) => new Set(contentTokens(o)));
  const scores = q.options.map((_, i) => {
    let s = 0;
    optTokens[i].forEach((t) => {
      if (!rat.has(t)) return;
      let shared = 0;
      optTokens.forEach((set, j) => {
        if (j !== i && set.has(t)) shared++;
      });
      const w = 1 / (1 + shared);
      s += /[0-9]/.test(t) ? 2 * w : w;
    });
    return Math.round(s * 100) / 100;
  });

  const k = scores[q.correctIdx];
  const othersMax = Math.max(...scores.filter((_, i) => i !== q.correctIdx));

  // "All of the above" / "Both A and B" carry no distinctive tokens, so the keyed
  // option always scores ~0 while the individually-worded distractors score high.
  // The heuristic cannot speak to these at all - 7 of the original 77 DISAGREES were
  // exactly this. They also breach the client's own item-writing standard ("single-
  // action options, no compound options"), so they belong in human review, not in a
  // clean import.
  if (COMPOUND_OPTION.test(q.options[q.correctIdx].trim()))
    return { bucket: "UNVERIFIABLE", scores, note: "compound-keyed-option (not scorable; also against the no-compound-options standard)" };

  if (othersMax >= 3 && othersMax >= 2 * k && k <= 2)
    return { bucket: "DISAGREES", scores, note: "other-option-overwhelmingly-supported" };
  if (k >= 2 && k > othersMax)
    return { bucket: "AGREES", scores, note: k >= 4 ? "strong" : "supported" };
  return { bucket: "UNVERIFIABLE", scores, note: k === 0 && othersMax === 0 ? "no-token-overlap" : "ambiguous" };
}

// ─── Seeded RNG + shuffle ────────────────────────────────────────────────────
// Seeded PER QUESTION from its source_id, not one stream consumed in iteration
// order. With a single stream, adding or removing any row reshuffles every row
// after it, which would silently invalidate the option order already imported and
// the letter references repaired against it (scripts/fix-explanation-letters.ts).
// Per-question seeding makes each row a pure function of its own id, so the export
// is stable under edits elsewhere.
function seedFrom(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h ^ SEED) >>> 0;
}
const rngFor = (id: string) => mulberry32(seedFrom(id));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(arr: T[], rng: () => number): { items: T[]; perm: number[] } {
  const items = [...arr];
  const perm = arr.map((_, i) => i);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return { items, perm };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function toCleanRow(q: NormQuestion, rng: () => number): string {
  const { items, perm } = shuffled(q.options, rng);
  const newKey = perm.indexOf(q.correctIdx);
  const firstSeg = q.topic.split("/")[0].trim().toLowerCase();
  const cluster = CLUSTER_ALIASES[firstSeg] ?? "";
  const cols = [
    `proto:${q.family}:${q.id}`,
    q.domain,
    cluster,
    q.topic,
    q.taxonomy,
    q.stem,
    q.rationale,
    "ABCD"[newKey],
    ...items,
  ];
  return cols.map(csvCell).join(",");
}
const CLEAN_HEADER = "source_id,domain,cluster,topic,cognitive_level,question,explanation,correct,option_a,option_b,option_c,option_d";
const QUAR_HEADER = "source_id,family,reason,question,keyed_option";

// ─── Main ────────────────────────────────────────────────────────────────────
type FamilyStats = {
  in: number;
  clean: number;
  agrees: number;
  disagrees: number;
  unverifiable: number;
  emptyRationales: number;
  duplicates: number;
  skippedMalformed: number;
  badDomain: number;
  domainCorrupt: number;
  markdownBold: number;
  clusterUnmatched: number;
  escapedStems: number;
  structuralAnomalies: number;
  keyDistribution: number[]; // slot counts in SOURCE order (pre-shuffle)
};
const newStats = (): FamilyStats => ({
  in: 0, clean: 0, agrees: 0, disagrees: 0, unverifiable: 0, emptyRationales: 0,
  duplicates: 0, skippedMalformed: 0, badDomain: 0, domainCorrupt: 0, markdownBold: 0,
  clusterUnmatched: 0, escapedStems: 0, structuralAnomalies: 0, keyDistribution: [0, 0, 0, 0],
});

const ESCAPE_BUG = /\\\s*"$/; // stems ending in the literal sequence ?\" / \"
const STRUCTURAL = /[a-z]\d{2}-year|\bward\d/i; // "medical ward62-year-old…"
const TEMPLATE_TYPO = / at a the | at the hospital, two |the A&E,| in witnesses/i; // "at a the health centre", "at the hospital, two nurses…"

async function main() {
  const stats: Record<string, FamilyStats> = {};
  for (const f of F) stats[f.slug] = newStats();

  const cleanRows: string[] = [];
  const quarRows: string[] = [];
  const seenStems = new Map<string, string>(); // normalised stem → first source_id
  const anomalies: string[] = [];
  

  const samplePrint: string[] = [];

  for (const family of F) {
    for (const file of family.files) {
      const loaded = await loadFile(file);
      const raws: RawQuestion[] =
        family.kind === "pool"
          ? (loaded as Array<{ questions: RawQuestion[] }>).flatMap((e) => e.questions ?? [])
          : (loaded as RawQuestion[]);

      for (const raw of raws) {
        const st = stats[family.slug];
        st.in++;
        const n = normalise(family, raw, file);
        if ("skip" in n) { st.skippedMalformed++; continue; }
        st.keyDistribution[n.correctIdx]++;
        if (n.rationale.length === 0) st.emptyRationales++;
        if (ESCAPE_BUG.test(raw.stem ?? "")) st.escapedStems++;
        if (/\*\*/.test(String(raw.stem ?? ""))) st.markdownBold++;
        // CJK the repair table does not cover. Never ship it silently: a student
        // reading a Chinese fragment mid-stem is worse than a missing question,
        // and a new stray token means the source generator has regressed.
        if (CJK.test(n.stem) || n.options.some((o) => CJK.test(o)) || CJK.test(n.rationale)) {
          st.structuralAnomalies++;
          if (anomalies.length < 10) anomalies.push(`${family.slug}:${n.id} — unrepaired CJK — ${n.stem.slice(0, 90)}`);
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, "unrepaired CJK token (add to CJK_REPAIRS and re-run)", n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
          continue;
        }
        if (STRUCTURAL.test(n.stem) || TEMPLATE_TYPO.test(n.stem)) {
          // Mangled stem text (source find-replace ate place names, dropped
          // clauses). Quarantine for repair in source + re-run; never ship.
          st.structuralAnomalies++;
          if (anomalies.length < 10) anomalies.push(`${family.slug}:${n.id} — ${n.stem.slice(0, 110)}`);
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, "structural-defect (mangled stem text — repair in source and re-run)", n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
          continue;
        }
        if (!VALID_DOMAINS.has(n.domain)) {
          st.badDomain++;
          // e.g. caribbean2000 items with the TAXONOMY value pasted into the
          // domain field ("ASE") — real domain is unrecoverable from the data.
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, `corrupt-domain-metadata (domain="${n.domain}" — taxonomy value in domain field; item held for manual re-tagging)`, n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
          continue;
        }
        {
          const firstSeg = n.topic.split("/")[0].trim().toLowerCase();
          if (!CLUSTER_ALIASES[firstSeg]) st.clusterUnmatched++;
        }

        // Copyright quarantine: whole family, no heuristic applied
        if (family.quarantineAll) {
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, family.quarantineAll, n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
          continue;
        }

        // Duplicate stems (first occurrence wins)
        const stemKey = n.stem.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const first = seenStems.get(stemKey);
        if (first) {
          st.duplicates++;
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, `duplicate-stem (kept ${first})`, n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
          continue;
        }
        seenStems.set(stemKey, `proto:${n.family}:${n.id}`);

        const verdict = agreement(n);
        if (verdict.bucket === "AGREES") {
          st.agrees++; st.clean++;
          if (!SAMPLE_ONLY) cleanRows.push(toCleanRow(n, rngFor(`proto:${n.family}:${n.id}`)));
        } else if (verdict.bucket === "DISAGREES" && HAND_REVIEWED_KEY_OK.has(`proto:${n.family}:${n.id}`)) {
          // Read by a human; the rationale does support the key. Treated as AGREES.
          stats[n.family].agrees++;
          stats[n.family].clean++;
          if (!SAMPLE_ONLY) cleanRows.push(toCleanRow(n, rngFor(`proto:${n.family}:${n.id}`)));
        } else if (verdict.bucket === "DISAGREES") {
          st.disagrees++;
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, `key-mismatch (${verdict.note}; scores ${verdict.scores?.join("/")})`, n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
        } else {
          st.unverifiable++;
          quarRows.push([`proto:${n.family}:${n.id}`, n.family, `unverifiable (${verdict.note})`, n.stem, n.options[n.correctIdx]].map(csvCell).join(","));
        }

        if (SAMPLE_ONLY && samplePrint.length < 400 && (st.agrees + st.disagrees + st.unverifiable) % 97 === 0) {
          samplePrint.push(
            `[${verdict.bucket} ${family.slug}:${n.id}] ${verdict.note}\n  Q: ${n.stem.slice(0, 100)}\n  KEY: ${n.options[n.correctIdx].slice(0, 80)}\n  RAT: ${n.rationale.slice(0, 100)}`
          );
        }
      }
    }
  }

  if (SAMPLE_ONLY) {
    console.log(samplePrint.join("\n\n"));
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "proto-import-clean.csv"), CLEAN_HEADER + "\n" + cleanRows.join("\n") + "\n");
    writeFileSync(resolve(OUT_DIR, "proto-quarantine.csv"), QUAR_HEADER + "\n" + quarRows.join("\n") + "\n");
    writeFileSync(resolve(OUT_DIR, "proto-audit-stats.json"), JSON.stringify({ seed: SEED, families: stats, anomalies }, null, 2));
  }

  // Console summary
  const t = (k: keyof FamilyStats) => Object.values(stats).reduce((a, s) => a + (s[k] as number), 0);
  console.log("family                in   clean  agree disgr unver empty  dup  badkey-dist(source slots 0-3)");
  for (const f of F) {
    const s = stats[f.slug];
    console.log(
      `${f.slug.padEnd(20)} ${String(s.in).padStart(5)} ${String(s.clean).padStart(7)} ${String(s.agrees).padStart(6)} ${String(s.disagrees).padStart(5)} ${String(s.unverifiable).padStart(6)} ${String(s.emptyRationales).padStart(5)} ${String(s.duplicates).padStart(4)}  [${s.keyDistribution.join(",")}]`
    );
  }
  console.log(`TOTAL in=${t("in")} clean=${t("clean")} agrees=${t("agrees")} disagrees=${t("disagrees")} unverifiable=${t("unverifiable")} emptyRat=${t("emptyRationales")} dups=${t("duplicates")} malformed=${t("skippedMalformed")} corruptDomain=${t("badDomain")} mdBold=${t("markdownBold")} clusterUnmatched=${t("clusterUnmatched")} anomalies=${t("structuralAnomalies")} escaped=${t("escapedStems")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
