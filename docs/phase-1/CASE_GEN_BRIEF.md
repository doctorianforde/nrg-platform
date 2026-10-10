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
   - **Q3 Prioritize.** Asked **before** anything confirms the diagnosis. A lab result that settles it comes *after* Q3.
   - **Q4 Generate solutions** and **Q5 Take action** have **different keys**. Q4 is a plan or expected order; Q5 is what the
     nurse does now. Don't key the same action twice.
   - **Q6 Evaluate.** Uses data from after the intervention, and that intervention was shown earlier.
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
9. **Data presentation.** Raw values, no flags or labels such as high or low, no reference ranges in the case text.
   Assessment follows body-systems order. Addendum 3: give urine output or electrolytes when fluids, kidneys or
   electrolyte-active drugs are involved.
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
