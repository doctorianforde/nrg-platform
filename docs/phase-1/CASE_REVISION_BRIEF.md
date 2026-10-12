# Case revision brief: nursing focus (2026-10-12)

For an AI author bringing **one existing case** up to Ian's "nursing focus" rule: prioritise the nursing diagnosis and treat
the presentation, rather than the medical diagnosis. Read `docs/phase-1/CASE_GEN_BRIEF.md` ("Nursing focus", the disclosure
plan, and item 9), `CASE_REVIEW_BRIEF.md`, the V3 standard (`docs/phase-1/case-standard/V3_case_standard.md` s.7.3 and
s.13), and the case.

- **Rewrite Q3** as the priority nursing diagnosis:
  - The stem asks for the priority nursing diagnosis.
  - Four parallel options in s.13 form: actual diagnoses with "related to … as evidenced by …"; risk diagnoses with
    "related to" only.
  - Write new rationales, `self_test` and `meta`. Keep it ASE.
- **Rewrite Q4** if it asks which prescription or medical treatment to expect. Make it a nursing intervention for the
  Q3 priority problem, with a key different from Q5's.
- **Check Q5–Q8.** Keys are nursing actions on the presentation. Q6 measures the outcome for the nursing diagnosis.
  Adjust Q6 options if needed.
- **Keep the story and data.** Where useful, add the doctor's working diagnosis to the narrative *after* Q3's stage. Keep
  full vitals, full examination and the medications chart.
- **Re-run the flow checks** (CASE_REVIEW_BRIEF item 2). Make sure no stage gives a new key away.
- **Update the teaching section** so it names the priority nursing diagnosis and links the interventions to it.
- **Validate.** Loop `npx tsx scripts/import-case.ts --check <file>` from the repo root until it passes. If it's blocked,
  say so.
- **Record.** Append `Revision (nursing focus, 2026-10-12): ` to `quality_report`, listing every question and key you
  changed.
- **Limits.** Don't import, touch the database or scripts, or call any AI API.

Report in under 120 words: each changed question with its old and new key, and what Jade should check.
