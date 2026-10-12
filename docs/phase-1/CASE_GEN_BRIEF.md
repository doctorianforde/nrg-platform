# Case generator brief

For an AI author (a Claude Code or Kimi Code agent) writing **one** unfolding case study from a CASE_REQUEST in a plan
file (`content/case-studies/plans/*.json`). You write `draft_path` and loop on the validator until it passes. A separate
reviewer then checks it (`CASE_REVIEW_BRIEF.md`), and Jade validates it clinically before students see it.

## Read first, in this order
1. `docs/phase-1/case-standard/V3_case_standard.md`: Jade's standard. It governs everything below.
2. `docs/phase-1/case-standard/CASE_REQUEST.md`: the error-prevention addendum (rules 1–5). Apply all of them.
3. `content/case-studies/NRG-MH-001.json`: the worked example and the **exact JSON shape** to produce. Read its
   `quality_report`: it lists the mistakes a first draft made.
4. `scripts/lib/case-standard.ts`: the types (`CaseDoc`) and the mechanical rules, including the stem-verb table (`STEM_VERBS`).

## Who it's for
Final-year nursing students sitting the RENR (Registered Nurse) exam in Trinidad and Tobago and the wider Caribbean. Every
decision is an **entry-level registered nurse's**. Caribbean setting: district hospitals, health centres, A&E, local names
and foods. Blood glucose in **mg/dL**. Electrolytes in mmol/L. No critical-care management, no advanced-practice or
physician decisions as the nursing answer. Any authority the key depends on (a standing order, a protocol) is stated in the case.

## Nursing focus (Ian, 2026-10-12)
The cases teach nursing judgement: **prioritise the nursing diagnosis and treat the presentation**, rather than naming the
medical diagnosis.
- **Q3 options are four nursing diagnoses** in V3 s.13 form:
  - Actual: "Problem related to cause, as evidenced by findings".
  - Risk: "Risk for problem related to risk factor", with no "as evidenced by".
  - Write the etiology as a cause the nurse can act on (e.g. "related to fluid loss from vomiting"), not a bare medical
    label, where possible.
  - Every option is supported by some cues.
  - The key is the one to address first: airway/breathing/circulation, then safety, an actual problem before a risk one
    unless the risk is the more immediately dangerous.
  - Use a "Problem" term that a Caribbean RN would recognise (NANDA-I style), and keep the four options parallel in
    length (the validator checks).
- The stem asks for the priority **nursing diagnosis** (or "patient problem"); the validator rejects a Q3 that asks for a
  medical condition.
- The medical diagnosis can be named in the story (for example, the doctor's working diagnosis after Q3), discussed in
  Q2's analysis, and taught in the pathophysiology section. No question's key is the medical diagnosis.
- Q4, Q5 and Q7–Q8 keys are nursing actions on the presentation: positioning, oxygen per protocol, monitoring and
  escalation, holding a dose, fluid and nutrition, safety, teaching, delegation, communication. A collaborative order is
  fine as a key only when the question is about the nurse carrying it out safely.
- The teaching section names the priority nursing diagnosis and links each intervention to it.
- **Don't let a pattern become the answer.** Across the bank, keys must not settle into "deficient fluid volume" for Q3 or
  "monitor intake, output and vital signs" for Q4.
  - Q4's key should be the most effective active nursing intervention for the priority problem (positioning, airway care,
    a safety measure, carrying out a protocol, feeding or fluid support, teaching), with monitoring as a distractor or as
    Q6's data. Use monitoring as the key only when monitoring truly is the best answer.
  - Before writing Q3 and Q4, run `npx tsx scripts/plan-cases.ts --report` and read the existing cases' Q3 and Q4 keys
    (`content/case-studies/**/*.json`). Avoid repeating them.

## How to build it (V3 s.17, in this order)
1. **Story first.** Write the whole clinical course in your head, from the opening to the endpoint: what is really happening,
   which findings appear when, what is done, and how the client responds. Every value must fit the pathophysiology and its
   timing (e.g. a drug level taken at the right time after the dose; findings severe enough for the level reported; an
   intervention ordered before it is evaluated). Then cut it into stages.
2. **Disclosure plan.** Each question gets the information it needs **and no more**:
   - **Q1 Recognize.** The baseline assessment gives several findings. One needs follow-up; the rest are explained by the
     presenting picture.
   - **Q2 Analyze.** New information arrives. The question asks what it **means** for the findings already seen. It is not
     "which test would you order".
   - **Q3 Prioritize.** The **priority nursing diagnosis**, not the medical condition (see "Nursing focus" below). Ask it
     before anything settles the picture.
   - **Q4 Generate solutions** is a **nursing intervention for that priority problem**: something the nurse does or
     initiates, which can include carrying out a protocol. It is not "which prescription will be ordered".
     **Name the diagnosis in Q4's stem** (e.g. "For Kamla's ineffective tissue perfusion, which intervention…"), never
     just "the priority problem". Students get no feedback until the end, so a student who chose another Q3 option
     must still meet a Q4 with one best answer. Q3 is locked by then, so naming it gives nothing away.
   - **Q5 Take action** is what the nurse does now. Q4 and Q5 have **different keys**; don't key the same action twice.
   - **Q6 Evaluate.** Measures the expected outcome for the nursing diagnosis (e.g. deficient fluid volume → urine output,
     mucous membranes, pulse), using data from after the intervention, and that intervention was shown earlier.
   - **Q7–Q8** (extensions): use the request's `q7_domain` and `q8_domain`, each testing that domain for real (delegation,
     communication with family, teaching, ethics, professional conduct).
3. **Never let a stage answer its own question.** If a stage says "the nurse may withhold the dose under standing orders",
   the question after it can't ask whether to withhold the dose. Put such authority in the opening or an earlier stage. The
   validator prints a warning when the key's wording repeats the stage text; treat it as an error to fix.
4. **Title** must not name or hint at the condition (V3 s.3).
5. **Options** (V3 s.9, addendum 1):
   - Four parallel options of similar length, with one best answer.
   - Each distractor is something a competent entry-level nurse could genuinely consider. It fails through a subtle error
     (wrong priority, wrong timing, wrong construct, an unsafe shortcut), never because it is silly.
   - Type every option `correct` / `close` / `priority` / `incorrect` / `unsafe`.
   - Spread the key across A–D within the case.
6. **Taxonomy.** One per question:
   - Q3 and Q6 are ASE.
   - Aim for 4–5 ASE questions per case, the rest AP, and at most one KC.
   - The construct decides the label; don't force it.
7. **Rationales** (V3 s.12):
   - The correct rationale cites the case data and the principle (60+ characters).
   - Each distractor rationale says why it is weaker *in this case*.
   - `self_test` is one sentence on why the best distractor is wrong, without "obviously" or "clearly".
8. **Pathophysiology teaching section** (V3 s.15). Markdown, 300+ characters:
   - the mechanism;
   - why each decision mattered (cite Q numbers);
   - prevention.
9. **Data presentation** (Ian, 2026-10-12; the validator enforces the first three):
   - **Full vital signs** every time vitals are given: temperature, pulse, respirations, blood pressure, SpO2 (with the
     oxygen delivery, e.g. "94% on room air"), and pain score (0–10, or FLACC for infants). Add blood glucose (mg/dL) where
     relevant. A single repeated reading, such as hourly glucose or a drug level, goes under `labs` ("Bedside tests"), not `vitals`.
   - **Full body-systems examination** every time an examination is given, in this order: Neurological, Cardiovascular,
     Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Integumentary, Psychosocial. Add Obstetric or Newborn
     findings where they apply. Normal systems are written as plain normal findings, e.g. "Abdomen soft, non-tender, bowel
     sounds present". The relevant cue sits among the normals, not alone, with nothing marking it out.
   - The first stage is the baseline: it has both full vitals and a full examination.
   - **Medications** (`medications` on a stage, and on `opening` for home medications). Each row has drug, dose, route,
     frequency, and an optional status (e.g. "last dose 10 pm yesterday", "due 10:00 am", "started 9:30 am"):
     - Chart the client's home or current medications at the start.
     - Chart each medication ordered in the case **on the stage where it is ordered**, never earlier.
     - A status that is the answer to a question ("held", "given", "stopped") appears only **after** that question, in a
       later stage.
     - Include the drugs the management of the condition really uses, with realistic adult or weight-based doses.
   - Raw values only: no flags, no labels such as high or low, no reference ranges in the case text.
   - Addendum 3: give urine output or electrolytes when fluids, kidneys or electrolyte-active drugs are involved.
10. **Gender.** Use the client's name and say "the client". Use he or she only when the scenario needs a sex (pregnancy,
    for example), and then stay consistent.

## Fields
Fill `CaseDoc` exactly as in NRG-MH-001:
- **From the request:** `case_code`, `primary_condition`, `primary_domain` and `difficulty`.
- **You write:** `objective`, `population`, `setting` and `endpoint`, refined from the request.
- **Fixed values:** `source: "ai:claude"`, `validation: {"status":"pending"}`.
- **Meta:** each question's `meta` has `topic`, `subtopic`, `priority_principle`, `prerequisites` and `suggested_review`.
- **`quality_report`:** list the Cover, Two-Answer, Cue-Sufficiency and Hidden-Assumption checks you ran, and anything Jade
  should confirm (doses, thresholds, local practice).

## Loop
1. Write the JSON to `draft_path`.
2. Run `npx tsx scripts/import-case.ts --check <draft_path>`. Fix every error, and every warning unless you can justify it
   in `quality_report`. Rerun until it passes.
3. Re-read the case as a student, stage by stage. At each question, ask yourself:
   - Could I answer it from what's on screen?
   - Does the screen already give the answer away?
   - Is there a second defensible answer?

   Fix what you find.
4. Don't import, don't touch the database or scripts, don't call any AI API.
5. Report in under 120 words: the case code, title, key letter per question, the warnings left and why, and what Jade
   should check.
