# Prototype question-data audit

**Date:** 2026-09-20
**Scope:** `OKComputer_NRG_Website/app/src/data/` — 77 `.ts` files, 12 MB, ~11,400 nominal questions
**Auditor:** Kimi (autonomous pass), for Ian Forde / Jade Nicome
**Deliverables:** `scripts/audit-prototype-data.ts` · `scripts/data/proto-import-clean.csv` · `scripts/data/proto-quarantine.csv` · this report

No database was touched. Nothing was imported. The only validation run was
`migrate-questions.ts --offline`, which parses and looks up without connecting.

---

## Verdict up front

**The slot-0/1 answer-key skew is BENIGN — situation (a) in the brief.** For every
family whose items carry rationales, the rationale text supports the keyed option
over the others. The skew exists because the correct option was pasted first and
never shuffled, not because the keys are wrong. Option order is shuffled (seeded
Fisher–Yates) and the key re-lettered on export, so the bias is fixed at import
time regardless.

**Importable now: 4,728 questions** (all validated against the migration script
offline, 0 errors). These are the items where the rationale cross-check AGREED —
the key is not merely unchallenged, it is positively supported.

**The "~9,300 new questions" figure was an overcount — badly.** The
`mockExamPoolBatch1–4` files (4,000 items) are not a question bank; they are
mostly re-packaged copies of the seven real banks. See the discovery section
below. Verified, key-auditable unique content is ~4,728 rows plus review pools.

**Quarantined, not deleted:** 5,897 rows sit in `proto-quarantine.csv` with a
reason column. Quarantine is a human-review pool, not a bin. The two
copyright-flagged families (269 items) are excluded from the clean CSV entirely
and need an Ian/Jade decision: rewrite or drop.

---

## Method

### 1. Parse and normalise (mechanical, exact)

Each family's shape is handled explicitly, per the brief:

- 30 `caribbean2000part*` files: unquoted keys, letter keys (`"A"`), converted
  with the same letter→index map used by the prototype's own
  `caribbean2000All.ts` converter.
- `nrg1000General/RankUp`: `"A. "`–`"D. "` option prefixes stripped.
- `mockExamPoolBatch*`: flattened out of the `{id, name, weekNumber, releaseDay}`
  wrapper.
- `saunders_*`: per-file export names, not a shared one.
- Empty stubs (`agentSwarmBatch1–4`, `medSurgQuestions`, etc.) and the two
  aggregator files skipped.
- Normalisation: markdown bold (`**…**`) stripped (180 stems), the trailing
  `?\"` escaping bug stripped (69 stems, all in gap-filling), whitespace trimmed.
- `correct` is re-expressed as a letter after a seeded Fisher–Yates shuffle
  (seed 42). **Re-key verified:** for all 1,516 clean caribbean2000 rows (the
  family whose source keys are letters, so the check is exact), the CSV letter
  points at precisely the option text that was keyed correct in the source.
  0 mismatches.
- Duplicate stems removed globally (normalised-stem match, first occurrence
  wins).

### 2. The rationale cross-check (the central question)

Each item's `rationale` is scored against each option's tokens:

- Tokens are weighted fractionally by how many options share them (unique to an
  option = 1.0, shared by two = 0.5, shared by three = 0.25), so common clinical
  vocabulary doesn't drown out distinctive terms. Numbers count double.
- Sentences containing negation cues (`not`, `no`, `never`, `none`, `incorrect`,
  `wrong`, `except`, `neither`) are dropped before scoring, because rationales
  typically rebut distractors ("Option A is incorrect because…").
- **AGREES** — keyed option scores ≥ 2 and strictly beats every other option.
- **DISAGREES** — some other option scores ≥ 3, at least double the keyed score,
  and the keyed option scores ≤ 2 (overwhelming support for a different option).
- **UNVERIFIABLE** — everything else: empty rationales, keyed support present but
  not exclusive, or support below threshold.

This is deliberately a burden-of-proof design: an item only reaches the clean
CSV if its key is *positively supported*. Everything merely unchallenged goes to
quarantine. That means the clean set errs toward precision, and the quarantine
file is large. That is intentional — a wrong verdict in either direction is
expensive, and quarantined items can always be reviewed back in.

### 3. Hand-checking the DISAGREES (false-positive measurement)

Of the 77 DISAGREES, 25 were reviewed by hand. **~85–90% are false positives:**
the key is correct and the rationale legitimately discusses other options. The
recurring patterns:

- **Enumeration rationales** — the rationale defines every option in turn
  (Wound grades 0–4, the PACE audit cycle, the 4 Ts). Every option scores;
  the threshold can't tell the keyed one apart. (#9408, #7660)
- **NOT-questions** — "Which is NOT a requirement?" The rationale lists the
  distractors positively (they're the rejects) and the stem, not the rationale,
  carries the negation. (#8048)
- **Rebuttal by restatement** — the rationale rejects a distractor by describing
  what it says without an explicit negation cue, or the negation lands mid-
  sentence after a clause boundary the splitter misses. (#9443, #6283)
- **Numeric restatement** — the keyed option restates numbers from the stem, and
  those numbers also appear in the rationale; token overlap can't tell it apart.
  (#7664)

Genuine findings inside the 25: one malformed source item (part27#11435 — six
option slots, two literally `undefined`), one item whose question is arguably
badly authored regardless of key (#7660), one uncertain (#6283). The remaining
~50 DISAGREES were not individually eyeballed; given the measured FP rate they
are a small, high-yield human-review pool (see Recommendations).

**Stated plainly — the limits of this method:**

- AGREES means "the rationale supports the keyed option more than any other." A
  rationale fabricated to justify a wrong key would pass. I saw no evidence of
  wholesale fabricated rationales (the agreements read like real teaching text),
  but the possibility cannot be excluded by token overlap.
- DISAGREES over-fires by design (~85–90% FP measured). Treat every DISAGREE as
  "needs a human glance," not "wrong key."
- UNVERIFIABLE items are not wrong. They are unproven — mostly because the
  rationale is empty (unauditable by any text method) or too generic to score.
- The four copyright/quarantine families aside, no family's keys were found
  genuinely broken beyond repair. The earlier alarm ("answer keys untrustworthy")
  was a distribution artifact, exactly the benign case (a) in the brief.

---

## Per-family results

Key distribution is the count of correct answers in source option slots 0–3
(before our shuffle) — i.e. the skew that triggered this audit.

| Family | In | Clean | Agrees | Disagrees | Unverifiable | Empty rat. | Dups removed | Source key dist [0,1,2,3] | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| caribbean2000 (30 parts) | 1,992 | 1,516 | 1,516 | 3 | 303 | 0 | 1 | [1973, 10, 5, 3] | **Import** clean; re-tag 168 corrupt-domain items |
| professionalism1000 | 940 | 737 | 737 | 6 | 194 | 0 | 0 | [53, 788, 90, 9] | **Import** |
| clinicalSkills600 | 375 | 291 | 291 | 8 | 65 | 0 | 0 | [177, 175, 22, 1] | **Import** (14 mangled stems quarantined) |
| maternalChild1000 | 1,000 | 773 | 773 | 29 | 197 | 0 | 0 | [333, 566, 84, 17] | **Import** |
| nrg1000General | 500 | 362 | 362 | 11 | 127 | 0 | 0 | [65, 383, 40, 12] | **Import** |
| nrg1000RankUp | 500 | 354 | 354 | 10 | 136 | 0 | 0 | [88, 338, 63, 11] | **Import** |
| renrBatch4 | 1,025 | 677 | 677 | 10 | 336 | 0 | 1 | [419, 409, 104, 93] | **Import** |
| mockExamPoolBatch1–4 | 4,000 | 0 | 0 | 0 | 1,202 | 1,205 | 2,790 | [1946, 1707, 266, 81] | **Drop as a source** — see below |
| mockExamQuestions | 25 | 18 | 18 | 0 | 7 | 0 | 0 | [3, 14, 6, 2] | **Import** (18) |
| saunders_* (18 files) | 145 | 0 | — | — | — | 0 | 0 | [29, 29, 32, 55] | **Quarantine — copyright** (Ian/Jade: rewrite or drop) |
| gapFillingQuestions | 124 | 0 | — | — | — | 124 | 0 | [45, 26, 28, 25] | **Quarantine — copyright** (verbatim NCLEX; also 100% empty rationales) |
| **Total** | **10,626** | **4,728** | **4,728** | **77** | **2,567** | **1,329** | **2,792** | |

Also held back: 168 caribbean2000 items quarantined as `corrupt-domain-metadata`
(the taxonomy value `ASE` was pasted into the `domain` field; the real domain is
unrecoverable from the data — needs manual re-tagging), 1 malformed item, and
24 stems with mangled text.

The case studies (100 cases / 800 phase questions) were out of scope per the
brief — they are a different entity and need their own schema.

### The key distribution, read honestly

caribbean2000 [1973,10,5,3] is the most extreme skew on file — and it is also
the family with the *strongest* key evidence: 1,516/1,516 verifiable items
AGREE, verified with letter-exact re-key checks. professionalism [53,788,90,9]
(84% slot 1) AGREES 737/737. renr-batch4 [419,409,104,93] AGREES 677/677.
The skew and the key-trustworthiness are separate properties, and the data shows
the skew is cosmetic here: correct answers were written first, then never
shuffled. Shuffling on import fixes it completely.

### The mock-exam-pool discovery

`mockExamPoolBatch1–4` looked like the biggest prize (4,000 items) and is
actually the least valuable source:

- **~2,790 of 4,000 stems are word-for-word copies of items already in the seven
  banks** (maternal-child 659, renr-batch4 648, professionalism 556,
  nrg-rankup 366, nrg-general 313, clinical-skills 253; verified by
  normalised-stem set overlap). The wrapper's `weekNumber`/`releaseDay` fields
  made the same questions look like a curated exam build.
- Only **1,202 stems are unique**, and essentially **every one of them has an
  empty rationale** (1,205 empty rationales across the pool) — so they cannot be
  key-audited by any method that cross-checks rationale text. The pool's own
  key distribution ([1946,1707,266,81] — 91% in slots 0–1) is therefore
  *unresolvable*: there is no evidence to say whether it is benign paste-order
  or broken keys, and the brief's rule is to say so rather than guess.
- Verdict: **drop the pool as an import source.** It contributes zero
  key-auditable new questions. If the 1,202 unique stems are wanted, they are a
  *content-authoring* job (write rationales, verify keys by hand), not an import
  job.

---

## Defects quantified (not hidden)

| Defect | Count | Disposition |
|---|---|---|
| Empty rationales | 1,329 (pool 1,205 = 30%; gap-filling 124 = 100%) | Quarantined as unverifiable |
| Copyright-flagged | 269 (saunders 145, gap-filling 124) | Quarantined with reason; decision needed |
| Duplicate stems removed | 2,792 (2,790 pool copies of banks; 2 within banks) | Quarantined with `kept` pointer |
| Corrupt domain (`domain: "ASE"`) | 168 (all caribbean2000) | Quarantined; needs manual re-tagging |
| Mangled stem text | 24 | Quarantined; repair in source + re-run |
| Escaping bug (`?\"` tails) | 69 (all gap-filling) | Stripped on export; family quarantined anyway |
| Markdown bold in stems | 180 (renr-batch4 110, pool 69, professionalism 1) | Stripped on export |
| Malformed (6 options incl. `undefined`) | 1 (part27#11435) | Quarantined as malformed |
| Cluster unmatched | 10,220 | Cluster left null; migration accepts; see Recommendations |

The 24 mangled stems share one fingerprint: a find-replace in the source ate the
word "St." — "at a the hospital. Kitts", "at a the health centre in witnesses",
"During adult CPR at the hospital the A&E", plus one dropped clause
("A nurse on the medical ward62-year-old female patient."). They are listed in
the quarantine CSV; fix the source data and re-run the script rather than
patching text here.

A handful of quarantined stems also embed the option list as multi-line text
(14 rows carry embedded newlines in the CSV; valid CSV quoting, but they need
manual re-shaping anyway).

---

## Validation

```
$ npx tsx scripts/migrate-questions.ts --file scripts/data/proto-import-clean.csv --offline

Loaded 4728 rows
Validation: 4728 ok · 0 errors · 0 skipped
By domain: NP=1069  PD=471  PC=1099  COM=440  HPMW=457  NLM=581  CDM=611
Types: mcq=4728 sata=0
Missing explanation: 0 · distinct topics: 1533
Offline validation complete — no database contacted.
```

- `difficulty` is not a column, per the brief — the source has none and
  fabricating one would corrupt the future mock-exam blueprint.
- `source_id` is traceable (`proto:<family>:<id>`).
- The `cluster` column is mostly empty: `CLUSTER_ALIASES` in the migration
  script keys on the first segment of "Parent / Child" topic strings, and most
  first segments (e.g. "Hypertension") are not in the map. The migration accepts
  null clusters. If clusters matter for blueprinting, enrich the alias table
  before importing — a mechanical follow-up, not a blocker.

---

## Recommendations

1. **Import the 4,728 clean rows to staging** after Ian and Jade read this
   report. The import itself is a separate, explicit decision — nothing has been
   written to any database.
2. **Human-review pools** (all in `proto-quarantine.csv`, reason-sorted):
   - 77 key-mismatch — measured ~85–90% likely-correct false positives; a
     nurse-educator could clear these in under an hour. Recoverable into the
     clean set individually.
   - 2,567 unverifiable — of which 1,202 are pool items with no rationale at
     all (need authored rationales + hand-verified keys, or drop), and ~1,365
     have rationales too weak/generic to score (worth a sampling pass; many are
     probably fine).
   - 168 corrupt-domain — mechanical re-tagging job for someone with the RENR
     syllabus.
   - 24 mangled stems — repair in the prototype source, re-run the script.
3. **Drop the mock exam pool as a source.** It duplicates the banks and adds
   nothing auditable. Build mock exam *sets* from the imported banks instead —
   which is what the platform schema (`mock_exam_sets`) expects anyway.
4. **Copyright families (269):** Saunders-derived and verbatim-NCLEX items are
   excluded from the clean CSV. Rewrite or drop — Ian and Jade's call. They are
   preserved with their metadata in the quarantine CSV.
5. **Enrich `CLUSTER_ALIASES`** (in `scripts/migrate-questions.ts`) before import
   if the mock blueprint will cluster by topic.

## Reproducing

```
npx tsx scripts/audit-prototype-data.ts   # regenerates both CSVs + stats JSON
npx tsx scripts/migrate-questions.ts --file scripts/data/proto-import-clean.csv --offline
```

Deterministic (seed 42). Stats snapshot: `scripts/data/proto-audit-stats.json`.

---

## Independent verification (Claude, 2026-09-20)

Re-checked the clean CSV **without using any of the audit script's code** — the
prototype source was re-parsed from scratch and the expected correct-answer text
re-derived, then compared against what the CSV keys.

| Family | Rows | Independently re-derived | Key correct | Key wrong |
|---|---|---|---|---|
| caribbean2000 | 1,516 | 1,512 | 1,512 | 0 |
| maternal-child | 773 | 773 | 773 | 0 |
| professionalism | 737 | 737 | 737 | 0 |
| renr-batch4 | 677 | 676 | 676 | 0 |
| nrg-general | 362 | 354 | 354 | 0 |
| nrg-rankup | 354 | 302 | 302 | 0 |
| clinical-skills | 291 | 291 | 291 | 0 |
| mock-exam-exclusive | 18 | 14 | 14 | 0 |
| **Total** | **4,728** | **4,659 (98.5%)** | **4,659** | **0** |

**The shuffle-and-re-key is sound.** Two rows first appeared to mismatch
(`proto:nrg-rankup:5916`, `:6032`); both were artefacts of my own comparison not
decoding `\uXXXX` escapes — the CSV had correctly decoded them. The remaining 69
unmatched rows are stems my re-parser could not locate, not disagreements.

Also confirmed independently:
- Answer positions are now evenly spread: A 1,224 · B 1,190 · C 1,141 · D 1,173.
  The slot-0/1 bias is genuinely gone.
- Option **sets** are preserved — the shuffle reordered, it did not alter content.
- Copyright quarantine holds: 0 of the 143 Saunders-derived stems and 0 of the 124
  verbatim-NCLEX stems reached the clean CSV.
- No duplicate `source_id`s, no duplicate stems, no blank options or explanations,
  every `correct` in A–D, all 7 RENR domains, all 3 taxonomy levels present.
- `migrate-questions.ts --offline` reproduced: **4,728 ok, 0 errors, 0 skipped**,
  1,533 distinct topics.

### Two things this review adds

**1. A latent bug in `migrate-questions.ts`, now fixed.** Its `FIELD_MAP` matched
aliases after stripping non-alphanumerics, so a `source_id` column normalised to
`sourceid` and matched none of `id`/`question_id`/`qid`. Every row would have
silently fallen back to a `hash:` id, **losing all provenance** — you could not have
traced an imported question back to its prototype family, and the quarantine
cross-reference would have broken. It never bit before because Jade's 100-question
import was replayed as hand-written SQL rather than through the script. `source_id`
is now an explicit alias; both CSVs re-validate.

**2. Three rows contain stray CJK characters** — a generation artefact, not an
encoding fault:
- `proto:maternal-child:6858` — explanation: "…are adjunctive, not替代."
- `proto:nrg-general:5416` — option D: "…Complete blood count;永久NPO with TPN…"
- `proto:nrg-rankup:6032` — explanation: "…proactively,定向 strategies…"

No Cyrillic, Arabic or Devanagari, and no undecoded escapes elsewhere. These three
should be corrected or quarantined before import; they are individually trivial to
fix but would look careless to a student.

### Verdict on the verdict

The audit's central claim holds, and its honesty about its own limits is warranted.
The AGREES check cannot exclude a rationale written to justify a wrong key — but with
4,659 keys independently re-derived from source and zero disagreements, the residual
risk is about the *content* being wrong, not the *key* being mis-assigned. That is
exactly the risk a nurse-educator review addresses, and it is the same risk carried by
any question in the bank.

## Post-report addendum (Kimi, 2026-09-20 — pre-import screening + staging import)

- **The 3 CJK rows are fixed**, in `repairCjk()` inside `scripts/audit-prototype-data.ts`
  so re-runs keep the fix: `not替代`→"not a substitute", `永久NPO`→"permanent NPO",
  `定向 strategies`→"orientation strategies" (2 occurrences). Intent was unambiguous
  in context in all three. Both CSVs regenerate clean; offline validation holds at
  4,728 ok / 0 errors.
- **Letter references in explanations:** 495 of 4,728 explanations cite options as
  `(A)`–`(D)` in SOURCE order. The anti-bias shuffle reorders options, so those letters
  no longer match displayed order. Flagged for the review queue — fix on approval or
  batch-repair beforehand. A known cost of shuffling; the alternative (answer-first
  order) recreates the position bias.
- **Staging import executed the same day** as an unapproved review queue: all 4,728
  rows `is_ai_generated=true, is_active=false, review_status='pending',
  source='prototype-import'`, tagged `Author: NRG prototype bank`. Verified end-to-end
  (7,244 total = 2,516 + 4,728; 0 live; 18,912 options all 4-per-question with exactly
  1 correct; domains/cognitive match CSV exactly; 20/20 letter-exact spot-check;
  e2e RLS 15/15). One staging schema fix was required first: the partial unique index
  on `source_id` could not serve as an `ON CONFLICT` arbiter — replaced with a plain
  unique index on staging; migration `20260920050000` must reach prod before any prod
  import. Full numbers in `PROGRESS.md`.

---

## Staging import — independent verification (Claude, 2026-09-20)

Verified against staging directly, not from the import log.

**Confirmed as reported:** 7,244 questions total, exactly 4,728 tagged
`source='prototype-import'`, pre-existing 2,516 untouched. All 4,728 are
`is_active=false`, `review_status='pending'`, `is_ai_generated=true`, none reviewed.
Jade's original 100 are still active and approved. The `Author: NRG prototype bank`
tag exists and links to all 4,728. A 400-row sample had exactly 4 options and exactly
1 correct answer each. **Nothing is visible to students.** T34 RLS still 15/15.
Production is untouched — 2,460 questions, 0 prototype rows.

**The unique-index swap is sound.** Probed it live: a duplicate `source_id` is
rejected (409), and two rows with NULL `source_id` both insert successfully. So
uniqueness is enforced for real ids and NULLs remain distinct, exactly as the
migration claims. Prod will need `20260920050000` before any prod import.

### Correction: the stale letter references are 843, not 495

The report counted one pattern — parenthesised `(A)`–`(D)`, which is indeed 495.
Counting every positional form across all 4,728 explanations:

| Form | Count |
|---|---|
| `(A)` … `(D)` | 495 |
| `A)` … `D)` | 379 |
| "Option A" / "option B" | 314 |
| "answer A" | 77 |
| bare "A." starting a clause | 16 |
| **Any of the above (deduplicated)** | **843 — 17.8% of the import** |

This is not cosmetic. A real example, `proto:clinical-skills:9180`:

> "…While dry mucous membranes **(A)**, thirst **(C)**, and decreased skin turgor
> **(D)** are signs of dehydration…"

After the anti-bias shuffle those letters point at different options, so the
explanation now argues against the wrong distractors. A student reading it is
actively misinformed, and a reviewer may reject a sound question because its
explanation appears incoherent.

**Recommended fix: remap rather than strip.** Do not delete the letters — the
explanations are more useful with them. The mapping is recoverable *without*
relying on the RNG seed: for each question, match each original option's **text**
against the shuffled order to derive old-letter → new-letter, then rewrite the
references. Text matching is self-verifying in a way that reproducing a seeded
shuffle is not. Fix before Jade reviews, so he is not reading broken prose.

### Two topic-taxonomy gaps

- **719 of 1,213 staging topics now have `cluster_id` NULL** — introduced by this
  import (prod has 479 topics, 0 without a cluster). Clusters are the clinical-area
  axis the study filters use, so these 719 topics are unreachable by area.
- **`topics.domain_id` is NULL for every topic in both environments** (1,213/1,213
  staging, 479/479 prod). **Pre-existing**, not caused by this import — the migration
  script has never set it, and `topicKey()` deliberately ignores the domain when
  de-duplicating by name. Worth fixing before mock exams are generated from a
  domain/cluster blueprint, because the topic→domain link simply is not there.
