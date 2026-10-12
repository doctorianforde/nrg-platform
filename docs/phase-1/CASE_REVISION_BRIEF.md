# Case revision brief (2026-10-12)

For an AI author bringing **one existing case** up to Ian's 2026-10-12 presentation rules. The rules are full vital signs,
a full body-systems examination, and charted medications. They are set out in `docs/phase-1/CASE_GEN_BRIEF.md` item 9:
read that, `CASE_REVIEW_BRIEF.md`, and the case.

- Add the missing vital signs, body systems and medications at every stage that has vitals or an examination. The added
  findings must be clinically consistent with that moment in the case: a septic client's skin, a DKA client's breathing,
  normal systems written as normal.
- Don't change what any question tests or its key. If an addition would cue or give away an answer, choose a neutral but
  true finding, or fix the stem or options so the question still has one best answer. Re-run the flow checks in
  CASE_REVIEW_BRIEF item 2.
- Chart medications:
  - home medications on `opening` (or the first stage);
  - each order on the stage where the narrative makes it, never earlier;
  - any "held", "given" or "stopped" status only after the question that tests that action.
- Loop `npx tsx scripts/import-case.ts --check <file>` until it passes. Clear the warnings or justify them.
- Append to `quality_report`: `Revision (2026-10-12): ` and what you added and any wording you changed.
- Don't import, touch the database or scripts, or call any AI API.

Report in under 100 words: what you added, any stem or option changes, and new items Jade should check (e.g. doses).
