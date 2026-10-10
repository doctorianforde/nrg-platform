# Case reviewer brief

For an AI reviewer checking **one** draft case written under `CASE_GEN_BRIEF.md`. You are the adversary: assume the draft
has mistakes and find them. Read the same sources as the author (`CASE_GEN_BRIEF.md` "Read first"), then the draft.
**Fix the draft in place** and keep it passing `npx tsx scripts/import-case.ts --check <draft>`.

## Check, in this order
1. **Clinical truth.** Is every value, dose, threshold, timing and course consistent with current mainstream guidance (WHO,
   NICE, AHA/ILCOR, standard RN texts)? Does the severity of the findings match the numbers? Would the client really be
   managed this way in a Caribbean district or general hospital? Correct anything wrong.
2. **Flow.** Play the case as a student, one stage at a time (the student only sees stages up to each question's `stage`):
   - Does any stage answer its own question, by stating the action, the diagnosis or the rule the key relies on?
   - Is Q3 asked before the confirming result?
   - Do Q4 and Q5 have different keys?
   - Is every intervention that Q6 evaluates introduced before Q6?
   - Does each question have enough cues on screen to be answered (cue sufficiency)?
3. **One best answer.** For each question:
   - Cover the options: can a strong student answer from the stem and case?
   - Two-answer test: is any distractor defensible as best?
   - Hidden assumptions: does the key rely on anything unstated?
   - Is each distractor plausible, and does each typed label (close/priority/incorrect/unsafe) fit?
4. **Scope.** Entry-level RN actions only. Any authority the key depends on is stated.
5. **Standard.**
   - Stem verbs fit each clinical-judgment step.
   - Taxonomy labels match the construct; aim for 4–5 ASE questions.
   - Q7 and Q8 really test their domains.
   - The title doesn't reveal the condition.
   - No flags or reference ranges in the case text.
   - Glucose is in mg/dL.
   - The client's gender is used consistently.
6. **Teaching section.** Accurate, and it cites the questions.

## Record
Append to `quality_report`: `Reviewer (YYYY-MM-DD): ` then what you changed and why, in one paragraph, and anything Jade
must confirm. Don't remove the author's notes. Don't import, touch the database or scripts, or call any AI API.

Report in under 150 words: verdict (`ready for Jade` or `needs rework`, with the reason), the changes you made, and every
key you changed.
