# Hand-off brief: audit Jade's prototype question data

**Written for:** Kimi (or any coding agent) running locally with repo access and no
prior context on this project.
**Created:** 2026-09-20 · **Status:** not started

Paste the block below as the task. It is deliberately self-contained — background,
method, deliverables and stopping conditions — so no chat history is needed.

Why this brief exists at all: the earlier summary of this data said the answer keys
"can't be trusted". That overstated it. The keys are **unverified**, not proven wrong,
and the difference decides whether ~9,000 usable questions get imported or discarded.
The method section below is the load-bearing part.

---

```text
TASK: Audit and normalise the question data in Jade's prototype so it can be
imported into the NRG platform. Produce a clean CSV and a written verdict.
DO NOT import anything. DO NOT touch production.

── CONTEXT ────────────────────────────────────────────────────────────────
Repo: ~/Desktop/NRG (Next.js 14 + Supabase + Vercel, live).
Read PROGRESS.md and PLAN.md first — they are the durable project record.
The section "Review of OKComputer_NRG_Website/" in PROGRESS.md describes this
data and is your background; this task is item 1 under "Next candidate" in
PLAN.md.

The prototype folder OKComputer_NRG_Website/ is gitignored and is NOT part of
the app. Never add it to tsconfig or commit it — its dependencies fail the
Next build.

Source data: OKComputer_NRG_Website/app/src/data/ — 77 .ts files, 12 MB,
roughly 11,400 questions plus 100 case studies.

── WHAT WE ALREADY KNOW ───────────────────────────────────────────────────
Counts (verified): caribbean2000part1–31 ≈1,994 (part7 is missing);
caribbeanProfessionalism1000 = 940; clinicalSkills600 = 375 (not 600);
maternalChildPediatric1000 = 1,000; nrg1000GeneralQuestions = 500;
nrg1000RankUpQuestions = 500; renrBatch4Questions = 1,025;
mockExamPoolBatch1–4 = 4,000 (3,979 unique); saunders_* (18 files) = 145;
gapFillingQuestions = 124; mockExamQuestions = 26; casestudies/caseStudiesAll
= 100 cases / 800 phase questions. These are EMPTY stubs (`= []`) — skip them:
agentSwarmBatch1–4, medSurgQuestions, safetyQuestions, psychosocialQuestions,
managementQuestions, maternalChildQuestions, clinicalJudgmentQuestions,
cardiacMiHfQuestions. caribbean2000All.ts and caseStudiesData.ts are
aggregators, not content.

Shape differences you must handle:
 - Most families: JSON-quoted keys, `correct` is a 0-based integer index.
 - All 30 caribbean2000part* files: unquoted keys, `correct` is a LETTER ("A").
   A converter already exists in caribbean2000All.ts — read it before writing
   your own.
 - nrg1000General / nrg1000RankUp: option text is prefixed "A. ", "B. " etc.
   Strip the prefix.
 - saunders_*: exports are per-file names (cardiovascularQuestions, not
   saunders_cardiovascularQuestions).
 - mockExamPoolBatch*: questions are nested inside a MockExam wrapper
   (id, name, weekNumber, releaseDay). Flatten.
 - Case studies are a different entity (vitalSigns, labReports, phases[],
   per-option booleans + per-option explanations). OUT OF SCOPE for this task —
   they need their own schema. Leave them alone.

Every MCQ carries `domain` (RENR codes NP/CDM/NLM/PC/HPMW/COM/PD) and
`taxonomy` (KC/AP/ASE) plus a free-text `topic`, often "Parent / Child" e.g.
"Respiratory Disorders / Pulmonary Embolism". There is no `difficulty` field
and no SATA — every item is 4-option single-answer.

── THE CENTRAL QUESTION (read this carefully) ─────────────────────────────
An earlier pass flagged the answer keys as untrustworthy because of their
DISTRIBUTION: in mockExamPoolBatch1–4 about 91% of correct answers sit in
option slots 0–1; caribbeanProfessionalism1000 has 84% at index 1;
renrBatch4Questions has 828/1,025 at index 0 or 1.

That is evidence the options were never shuffled. It is NOT evidence the keys
are WRONG. Two very different situations produce it:

  (a) BENIGN — the keyed option really is the correct answer, it was just
      always written first. The data is fine; shuffle option order on import.
  (b) BROKEN — the key does not match the content, so the question is unusable.

Do not assume (b). Distinguishing them is the whole point of this task, and
about 9,000 usable questions depend on getting it right.

METHOD: use the rationale as the cross-check. Each question has a `rationale`
explaining why the answer is correct. Test whether the rationale supports
options[correct] more than it supports any other option — e.g. token overlap,
or the rationale naming a distinctive phrase from the keyed option. Example
from the real data: rationale "Hand hygiene is universally recognized as the
single most effective measure..." against options[1] "Hand hygiene performed
before and after patient contact" — clear agreement, key is right.

Report three buckets per family: AGREES, DISAGREES, UNVERIFIABLE (empty or
uselessly generic rationale). Tune your matching on a sample you check by hand
first, and state your false-positive rate honestly. If your method cannot
separate (a) from (b) for a family, say so rather than guessing — a wrong
verdict here either discards good content or ships wrong answers to students
sitting a licensing exam.

── KNOWN DEFECTS TO QUANTIFY, NOT HIDE ───────────────────────────────────
 - Empty rationales: ~30% of mockExamPool (312/286/309/298 per batch);
   124/124 of gapFillingQuestions. Count them per family.
 - gapFillingQuestions: an escaping bug — every stem ends `?\\"`.
 - Repetitive generated stems, e.g. "Which priority diagnostic test should the
   nurse anticipate?" appears 28× in the case studies.
 - Occasional dropped clauses, e.g. clinicalSkills600 id 9106: "A nurse on the
   medical ward62-year-old female patient."
 - 21 duplicate stems across the four mock batches; ~5 elsewhere.

── COPYRIGHT: QUARANTINE, DO NOT INCLUDE ─────────────────────────────────
Exclude from the output CSV entirely, but still report on them:
 - All 18 saunders_* files (145 q). They self-document the problem with the
   header: "// Source: Saunders Q&A Review (paraphrased for RENR format)".
 - gapFillingQuestions (124 q) — verbatim classic NCLEX items.
Put these in a separate quarantine CSV with a one-line note. Ian and Jade will
decide whether they get rewritten or dropped. Do not paraphrase them yourself.

── OUTPUT SHAPE ───────────────────────────────────────────────────────────
Target the CSV that scripts/migrate-questions.ts already accepts. Read that
script's FIELD_MAP, COGNITIVE_MAP, DOMAIN_ALIASES and CLUSTER_ALIASES before
writing anything — they do more than you expect, and CLUSTER_ALIASES keys off
the FIRST segment of a "Parent / Child" topic string.

Columns:
  source_id,domain,cluster,topic,cognitive_level,question,explanation,
  correct,option_a,option_b,option_c,option_d

 - source_id: stable and traceable, e.g. proto:caribbean2000:9604
 - cognitive_level: pass KC/AP/ASE straight through — the script maps them.
 - correct: a letter (A–D) after you have shuffled.
 - difficulty: NOT a column. The source has none. Leave it out rather than
   inventing one — the schema allows NULL, and a fabricated difficulty would
   corrupt the mock-exam blueprint later.
 - Shuffle option order per question and re-key `correct` to match. This fixes
   the slot-0/1 bias regardless of which way the audit lands.

── DELIVERABLES ───────────────────────────────────────────────────────────
1. Your audit script, committed under scripts/ (TypeScript, run with npx tsx,
   matching the conventions of scripts/migrate-questions.ts).
2. scripts/data/proto-import-clean.csv — everything that passed.
3. scripts/data/proto-quarantine.csv — copyright-flagged and key-failed items,
   with a reason column.
4. A written report: docs/phase-1/PROTOTYPE_DATA_AUDIT.md — per family: count
   in, count out, AGREES/DISAGREES/UNVERIFIABLE, empty-rationale count,
   duplicates removed, and your recommendation (import / needs human review /
   drop). State your method and its limits plainly.
5. Verify without writing to any database:
     npx tsx scripts/migrate-questions.ts --file scripts/data/proto-import-clean.csv --offline
   That validates parsing and lookups and touches nothing. Report the counts.
6. Update PROGRESS.md (what you found) and PLAN.md (status) before you finish.

── RULES ──────────────────────────────────────────────────────────────────
 - Staging before prod for anything involving a database. For this task you
   should not need either — --offline is enough.
 - Never use production credentials. Never run migrate-questions.ts with
   --env prod.
 - Do not import. The import is a separate decision after Ian and Jade read
   your report.
 - Do not commit the OKComputer_NRG_Website folder or add it to tsconfig.
 - If you find that a family's keys are genuinely broken beyond repair, say so
   and exclude it. Losing 4,000 weak questions is much cheaper than teaching a
   nursing student a wrong answer.

STOP AND ASK rather than guessing if: the rationale cross-check is ambiguous
for a whole family, the domain/taxonomy tags look arbitrary (one report noted a
scarlet-fever pharmacology item tagged domain PC), or you find content that
looks copied from a source not already listed above.
```

---

## Notes for whoever reviews the result

- The go/no-go on importing is **Ian and Jade's**, not the agent's. The brief
  deliberately stops at a report plus an offline-validated CSV.
- `scripts/qa-sample.mjs` already exists for spot-checking migrated rows against a
  source CSV side by side. It is the natural next step once an import happens, and
  the same read-and-verify judgement that closes T33 applies here.
- Two follow-ups this audit does **not** cover: the 100 case studies (they need their
  own schema for vitals, labs and phases) and `nrg1000RankUpQuestions`, which is the
  intended bank for the rank-up exams described in `PROGRESS.md`.
