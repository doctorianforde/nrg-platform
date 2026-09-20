# Copyright review list — questions held back from import

**Created:** 2026-09-20 · **Status:** awaiting an Ian/Jade decision
**Count:** 269 questions across 19 files

These items were excluded from `scripts/data/proto-import-clean.csv` and were
**never imported** to any environment. They sit only in the local, gitignored
`scripts/data/proto-quarantine.csv`.

## Why this list holds identifiers and not questions

The concern is the text itself, so reproducing the stems here would commit the
very material in question to a Git history that is hard to purge. Each row below
is enough to find an item in the prototype source and no more.

## The two problems are different

**1. Saunders-derived — 145 items, 18 files.** Each file self-documents its origin
in a header comment reading "Source: Saunders Q&A Review (paraphrased for RENR
format)". Paraphrasing a copyrighted question bank produces a derivative work; it
does not clear the rights. All 145 carry rationales, so they are otherwise usable
content — which is why they are tempting, and why they need a decision.

**2. Verbatim NCLEX — 124 items, 1 file.** `gapFillingQuestions.ts` reproduces
classic free-circulating NCLEX items word for word, and **none has a rationale**
(0 of 124). Provenance is unclear and teaching value is low without explanations.

## Recommendation

**Drop both sets rather than rewrite them.** The staging bank already holds 4,728
clean, RENR-tagged, rationale-complete questions. These 269 are a ~5% gain against
a real legal exposure and a large amount of Jade's time. A rewrite deep enough to
clear the derivative-work problem amounts to writing new questions — and if he is
writing new questions, the 50 high-yield RENR topics are a better target than
reworking someone else's.

If any are kept they need either a documented licence, or a rewrite done by someone
who has not read the original.

## The list

### `saunders_cardiovascularQuestions.ts` — 16 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 16 of 16

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Cardiovascular Disorders | NP | AP | 5065, 5066, 5067, 5068, 5069, 5070, 5071, 5072, 5073, 5074, 5075, 5076 … (+4 more) |

### `saunders_emergencytraumaQuestions.ts` — 4 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 4 of 4

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Trauma & Environmental Emergencies | CDM | ASE | 5021, 5022, 5023, 5024 |

### `saunders_endocrineQuestions.ts` — 5 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 5 of 5

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Endocrine & Metabolic Disorders | NP | ASE | 5016, 5017, 5018, 5019, 5020 |

### `saunders_generalQuestions.ts` — 5 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 5 of 5

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| General Nursing Practice | NP | ASE | 5046, 5047, 5048, 5049, 5050 |

### `saunders_ginutritionQuestions.ts` — 5 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 5 of 5

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Nutrition Support & Feeding | NP | AP | 5097, 5098, 5099, 5100, 5101 |

### `saunders_infectioncontrolQuestions.ts` — 1 item

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 1 of 1

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Infection Prevention & Communicable Disease | NP | ASE | 5139 |

### `saunders_maternalnewbornQuestions.ts` — 16 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 16 of 16

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Newborn Immediate Care & Assessment | HPMW | ASE | 5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010, 5011 … (+4 more) |

### `saunders_medicalsurgicalQuestions.ts` — 5 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 5 of 5

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Perioperative Nursing | NP | AP | 5102, 5103, 5104, 5105, 5106 |

### `saunders_mentalhealthQuestions.ts` — 14 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 14 of 14

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Anxiety, Depression & Coping Mechanisms | COM | AP | 5117, 5118, 5119, 5120, 5121, 5122, 5123, 5124, 5125, 5126, 5127, 5128 … (+2 more) |

### `saunders_musculoskeletalQuestions.ts` — 5 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 5 of 5

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Musculoskeletal Disorders | NP | AP | 5045, 5046, 5047, 5048, 5049 |

### `saunders_neurologicalQuestions.ts` — 10 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 10 of 10

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Neurological Disorders | NP | ASE | 5107, 5108, 5109, 5110, 5111, 5112, 5113, 5114, 5115, 5116 |

### `saunders_nursingprocessQuestions.ts` — 16 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 16 of 16

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Nursing Process & Care Planning | NP | AP | 5029, 5030, 5031, 5032, 5033, 5034, 5035, 5036, 5037, 5038, 5039, 5040 … (+4 more) |

### `saunders_oncologyQuestions.ts` — 4 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 4 of 4

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Oncology & Hematologic Disorders | NP | ASE | 5061, 5062, 5063, 5064 |

### `saunders_pediatricsQuestions.ts` — 7 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 7 of 7

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Pediatric Growth & Development | HPMW | AP | 5131, 5132, 5133, 5134, 5135, 5136, 5137 |

### `saunders_pharmacologyQuestions.ts` — 16 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 16 of 16

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Medication Administration Safety | PC | AP | 5081, 5082, 5083, 5084, 5085, 5086, 5087, 5088, 5089, 5090, 5091, 5092 … (+4 more) |

### `saunders_professionalpracticeQuestions.ts` — 4 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 4 of 4

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Professional Conduct & Ethics | NLM | AP | 5025, 5026, 5027, 5028 |

### `saunders_renalurinaryQuestions.ts` — 1 item

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 1 of 1

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Renal & Urinary Disorders | NP | ASE | 5138 |

### `saunders_respiratoryQuestions.ts` — 11 items

Header in source: _Source: Saunders Q&A Review (paraphrased for RENR format)_  
Rationales present: 11 of 11

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Respiratory Disorders | NP | ASE | 5050, 5051, 5052, 5053, 5054, 5055, 5056, 5057, 5058, 5059, 5060 |

### `gapFillingQuestions.ts` — 124 items

Header in source: _verbatim classic NCLEX items; 100% empty rationales_  
Rationales present: 0 of 124

| Topic | Domain | Taxonomy | Prototype ids |
|---|---|---|---|
| Cardiovascular Disorders | CDM | ASE | 9480, 9481, 9482, 9483, 9484, 9485, 9486, 9487, 9488, 9489, 9490, 9491 … (+57 more) |
| Nutrition Support & Feeding | NP | AP | 9594, 9595, 9596, 9597, 9598, 9599, 9600, 9601, 9602, 9603 |
| Renal & Urinary Disorders | NLM | AP | 9549, 9550, 9551, 9552, 9553, 9554, 9555, 9556, 9557, 9558, 9559, 9560 … (+33 more) |

---

Regenerate with `npx tsx scripts/list-copyright-items.ts`. That script reads the
prototype source and emits identifiers only — it never copies question text into a
tracked file.
