# Proposal — give the 726 cluster-less topics a clinical area

**Created:** 2026-09-20 · **Status:** awaiting Jade's sign-off
**Scope:** 726 topics holding 4,630 questions on staging

## The problem in one line

Of 1,220 topics on staging, 726 have no `cluster_id`, and they carry
4,630 of the 7,314 questions in the bank. Anything that filters or
targets study by clinical area cannot see them — the review screen shows their Area as "—".

## Why this is 101 decisions and not 726

The imported topics are named `Clinical area / Sub-topic`, for example
`Oncology & Hematologic Disorders / Cancer Grading and Staging`. The 726 topics share
just **101 distinct first segments**, so mapping a segment assigns every topic under it.

## Two things this proposal deliberately does NOT do

**It does not collapse the topics.** 726 topics for 4,630 questions looks like sprawl, and
349 of them hold a single question. But the sub-topic half is real content: only 53 of 726
(7%) merely restate the question's RENR domain, which is already stored on the question.
The other 673 name a genuine clinical sub-topic. Collapsing them would discard teaching
detail to fix a different problem. Topic granularity is worth revisiting once there is
usage data showing which topics students actually practise.

**It does not add new clusters.** Every segment has an obvious home in the five that
already exist, so this needs no schema change and creates no second taxonomy. The
split is more even than expected - the two biggest areas take a third of the bank each
(1,553 and 1,524 questions) rather than one swallowing everything. If the areas later
need to be finer, splitting cluster 1 by body system is a separate product decision.

## Where the questions would land

| Cluster | Segments | Topics | Questions |
|---|---:|---:|---:|
| 3 — Maternal-child and family nursing | 36 | 194 | 1,553 |
| 1 — Medical-surgical and community health priorities | 42 | 419 | 1,524 |
| 4 — Management, legal, and professionalism | 11 | 69 | 931 |
| 2 — Safety, infection control, and core procedures | 8 | 23 | 412 |
| 5 — Psychosocial and therapeutic communication | 4 | 21 | 210 |

## The calls worth arguing about

Most rows are mechanical. These are the ones where a nurse might reasonably disagree:

- **Gynaecology sits in med-surg.** `Uterine Fibroids` (34 questions), `Cervical Cancer`
  (33), `Breast Cancer` (26) and `Prostate Cancer` (26) are mapped to cluster 1, not to
  maternal-child. Cluster 3 is read here as pregnancy, birth and children; gynae
  oncology is closer to med-surg. Say if you would rather have a women's health area.
- **`Dengue` vs `Dengue in Children`** split across clusters 1 and 3 respectively. Both
  are Caribbean-relevant and both are worth keeping; the split follows the age group.
- **`Substance Abuse & Withdrawal Safety`** is mapped to psychosocial (5) rather than
  core procedures (2), on the basis that the questions are about assessment and
  therapeutic response rather than a procedure.
- **`Nutrition Support & Feeding` and `Holistic Assessment & Vital Signs`** are mapped to
  cluster 2 as core nursing procedures; they could equally be read as med-surg.

## The mapping — please correct anything wrong

Ordered by question count, so the rows that matter most are at the top. The rule column
says which pattern matched; `medical-surgical (default)` means nothing more specific did,
so those are the rows most worth a second look.

| Questions | Topics | Clinical area (first segment) | → Cluster | Matched rule |
|---:|---:|---|---|---|
| 173 | 15 | Nursing Theorists | 4 — Management, legal, and professionalism | professional |
| 163 | 7 | Nursing Profession | 4 — Management, legal, and professionalism | professional |
| 153 | 8 | Nursing Research | 4 — Management, legal, and professionalism | professional |
| 135 | 6 | Nursing Ethics | 4 — Management, legal, and professionalism | professional |
| 96 | 9 | Neonatal Jaundice | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 90 | 82 | Trauma & Environmental Emergencies | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 89 | 2 | Cardiovascular Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 85 | 77 | Oncology & Hematologic Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 81 | 20 | GI & Hepatobiliary Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 75 | 18 | Musculoskeletal Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 71 | 71 | Endocrine & Metabolic Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 70 | 17 | Respiratory Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 69 | 67 | Renal & Urinary Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 67 | 1 | Wound Care & Aseptic Technique | 2 — Safety, infection control, and core procedures | core procedure |
| 63 | 1 | Fluid Balance & I/O Management | 2 — Safety, infection control, and core procedures | core procedure |
| 62 | 12 | Pediatric Infectious Disease | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 62 | 15 | Infectious Disease & Immunology | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 62 | 5 | Delegation, Assignment & Supervision | 4 — Management, legal, and professionalism | professional |
| 61 | 12 | Pediatric GI & Nutritional Disorders | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 60 | 1 | Medication Administration Safety | 2 — Safety, infection control, and core procedures | core procedure |
| 59 | 13 | Pediatric Neurological Disorders | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 59 | 6 | Substance Abuse & Withdrawal Safety | 5 — Psychosocial and therapeutic communication | psychosocial |
| 59 | 5 | Family Dynamics & Counselling | 3 — Maternal-child and family nursing | child & family |
| 58 | 1 | IV Therapy & Infusion Monitoring | 2 — Safety, infection control, and core procedures | core procedure |
| 57 | 10 | Child Injury Prevention | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 55 | 14 | Obstetric Emergencies | 3 — Maternal-child and family nursing | obstetric |
| 55 | 10 | Pediatric Cardiovascular Disorders | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 55 | 10 | Child Abuse Recognition & Safeguarding | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 55 | 5 | Schizophrenia & Psychosis Management | 5 — Psychosocial and therapeutic communication | psychosocial |
| 54 | 13 | Pediatric Respiratory Disorders | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 53 | 10 | Postpartum Assessment & Care | 3 — Maternal-child and family nursing | obstetric |
| 52 | 5 | Legal Nursing Practice | 4 — Management, legal, and professionalism | professional |
| 51 | 1 | CPR & Emergency Response | 2 — Safety, infection control, and core procedures | core procedure |
| 51 | 9 | Intrapartum Care & Delivery Prep | 3 — Maternal-child and family nursing | obstetric |
| 51 | 5 | Anxiety, Depression & Coping Mechanisms | 5 — Psychosocial and therapeutic communication | psychosocial |
| 48 | 13 | Newborn Immediate Care & Assessment | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 48 | 8 | Pediatric Diarrheal Disease & Dehydration | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 46 | 13 | Neurological Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 45 | 5 | Therapeutic Communication & Counselling | 5 — Psychosocial and therapeutic communication | psychosocial |
| 45 | 7 | Nutrition Support & Feeding | 2 — Safety, infection control, and core procedures | core procedure |
| 43 | 3 | Nursing Bodies | 4 — Management, legal, and professionalism | professional |
| 42 | 5 | Professional Conduct & Ethics | 4 — Management, legal, and professionalism | professional |
| 42 | 6 | Gastrointestinal Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 41 | 16 | Antenatal Care & High-Risk Pregnancy | 3 — Maternal-child and family nursing | obstetric |
| 41 | 10 | Pediatric Growth & Development | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 39 | 1 | Anemia in Pregnancy | 3 — Maternal-child and family nursing | obstetric |
| 39 | 6 | Infection Prevention & Communicable Disease | 2 — Safety, infection control, and core procedures | core procedure |
| 39 | 5 | Nursing Leadership & Resource Management | 4 — Management, legal, and professionalism | professional |
| 38 | 1 | Birth Asphyxia | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 38 | 1 | Hypertensive Disorders of Pregnancy | 3 — Maternal-child and family nursing | obstetric |
| 37 | 1 | Dengue in Children | 3 — Maternal-child and family nursing | child & family |
| 37 | 1 | Preterm Labour | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 36 | 1 | Sickle Cell in Children | 3 — Maternal-child and family nursing | child & family |
| 36 | 1 | Neonatal Sepsis | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 36 | 1 | Postpartum Hemorrhage | 3 — Maternal-child and family nursing | obstetric |
| 35 | 1 | Congenital Anomalies | 3 — Maternal-child and family nursing | obstetric |
| 35 | 1 | Gestational Diabetes Mellitus | 3 — Maternal-child and family nursing | obstetric |
| 35 | 1 | Puerperal Sepsis | 3 — Maternal-child and family nursing | obstetric |
| 35 | 5 | Nursing Process & Care Planning | 4 — Management, legal, and professionalism | professional |
| 34 | 1 | Pediatric Bronchiolitis | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 34 | 1 | Prematurity | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 34 | 1 | RDS | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 34 | 1 | Ectopic Pregnancy | 3 — Maternal-child and family nursing | obstetric |
| 34 | 1 | Miscarriage | 3 — Maternal-child and family nursing | obstetric |
| 34 | 1 | Uterine Fibroids | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 34 | 5 | Clinical Decision Making & Prioritization | 4 — Management, legal, and professionalism | professional |
| 33 | 1 | Cervical Cancer | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 32 | 1 | Dengue | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 32 | 1 | Pediatric Sepsis | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 31 | 1 | Sepsis | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 30 | 1 | Diabetic Foot | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 30 | 1 | Appendicitis | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 30 | 1 | Head Injury | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 29 | 1 | Cholecystitis | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 29 | 1 | BPH | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 29 | 5 | Holistic Assessment & Vital Signs | 2 — Safety, infection control, and core procedures | core procedure |
| 28 | 1 | Asthma | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 28 | 1 | Hernia | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 28 | 1 | Urolithiasis | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 27 | 1 | HIV/AIDS | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 27 | 1 | Pediatric Gastroenteritis | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 27 | 1 | Trauma & Fractures | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 27 | 1 | Intestinal Obstruction | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 26 | 1 | Pediatric Pneumonia | 3 — Maternal-child and family nursing | paediatric / neonatal |
| 26 | 1 | Obesity | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 26 | 1 | Thyroid Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 26 | 1 | Breast Cancer | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 26 | 1 | Prostate Cancer | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 26 | 1 | Colorectal Cancer | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 25 | 1 | IHD & ACS | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 25 | 1 | Heart Failure | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 25 | 1 | COPD | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 24 | 1 | CAP | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 24 | 1 | T2DM | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 22 | 1 | CKD | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 22 | 1 | TB | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 1 | 1 | Chronic Respiratory Disease (COPD) | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 1 | 1 | Renal Disorders (GN/Nephritic/UTI) | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 1 | 1 | Intrapartum Care | 3 — Maternal-child and family nursing | obstetric |
| 1 | 1 | Neurological Assessment | 1 — Medical-surgical and community health priorities | medical-surgical (default) |
| 1 | 1 | Neoplastic Disorders | 1 — Medical-surgical and community health priorities | medical-surgical (default) |

## Separate issues found while measuring this

These are not fixed by the mapping and need their own decision.

1. **Two naming conventions now sit in one table.** The 494 curated topics are single
   words (`Cardiac`, `Renal`, `Medication safety`); the imported 726 are compound
   (`Cardiovascular Disorders / Heart Failure`). Students would see both styles in one
   list. Worth deciding whether to unify before any of this goes live.
2. **56 topics are bare abbreviations** — `COPD`, `CAP`, `T2DM`, `CKD`, `TB`, `BPH`,
   `RDS`, `IHD & ACS`, `HIV`. These would display to students as-is and should be spelled out.
3. **Near-duplicates at different granularity**, e.g. `COPD` (25 questions) alongside
   `Chronic Respiratory Disease (COPD)` (1), and `Intrapartum Care & Delivery Prep` (51)
   alongside a bare `Intrapartum Care` (1). Merging each pair is safe and would remove
   a handful of one-question topics.
4. **Every topic in both environments has `domain_id` NULL** — pre-existing, not caused
   by this import. The migrate script never sets it and topics are de-duplicated by name
   alone. Question-level domain is set correctly, so nothing is broken today, but the
   column is dead weight until it is either populated or dropped.

---

Regenerate with `npx tsx scripts/propose-topic-clusters.ts`.
Apply to staging with `--apply` (it refuses to run against production).
