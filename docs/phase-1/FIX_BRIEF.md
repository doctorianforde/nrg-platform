# Fix brief: resolving the `needs_changes` pile (2026-10-09)

For an AI reviewer resolving one batch of questions that an earlier review flagged (`data/review/fix/*.in.json`).
Every rule in `docs/phase-1/REVIEW_BRIEF.md` still applies (read it first). This brief only changes what you
do with a flagged item. Each input item carries `flag_note`: the earlier reviewer's reason. Most notes end
"Jade to decide". Ian has asked for reasonable corrections now. Rewrites go back to Jade's normal approval
queue (`pending`), and retirements are reversible. So **decide**; don't defer.

## Three verdicts
- `"ok"`: a full rewrite that passes the check. The item returns to `pending` for Jade's approval.
- `"retire"`: no rewrite. Give `retire_reason` (one or two sentences, 20+ characters). The item becomes `rejected` and stays inactive.
- `"flag"`: only when the answer truly depends on information only Jade has, e.g. a Trinidad and Tobago law or
  local policy the item can't be rewritten to avoid. Same fields as before. Aim for under 10% flagged.

## Defaults by flag type
1. **clinical-key** (disputed or wrong key). Unlike REVIEW_BRIEF rule 1, you **may change the key** here when current
   mainstream guidance (WHO, NICE, AHA/ILCOR, standard RN textbooks) clearly supports another answer. Start `changes` with
   `KEY CHANGED: <old> → <new> because <guideline/reason>`. If the point is genuinely contested, rewrite the stem so it
   tests something with one defensible answer: add the missing data, or narrow the question. Mark that in `changes` as
   `REFRAMED:`. If the explanation contradicts the key (e.g. a threshold), go with the established clinical value.
2. **scope** (critical care, advanced practice, physician decisions, specialist knowledge). Rewrite it as an
   **entry-level RN question on the same topic** where a natural one exists. For example:
   - septic-shock vasopressors → recognising and escalating sepsis on a ward;
   - RSI drugs → the nurse's role in preparing for or monitoring intubation;
   - NP prescribing → RN scope.

   Start `changes` with `RESCOPED:`. If no honest entry-level version exists (pure specialist knowledge, research
   methods, ministry policy), **retire** it.
3. **duplicate**. Retire the flagged item and name the kept source_id in `retire_reason` ("Duplicate of <source_id>, which is
   kept."). If the note says the *other* item is the weaker one, still retire this one; don't touch items outside your batch.
4. **needs-jade**:
   - **Garbled or missing text.** Reconstruct it when the options, explanation and topic make the intent clear (`RECONSTRUCTED:`).
     Otherwise retire.
   - **Numeric or statistic options** (incidence figures, nomogram thresholds), or several valid answers. Recast as a nursing
     decision on the same topic, or retire if there isn't one.
   - **Age or condition mismatches.** Fix the detail to the clinically correct one (`changes` says so).
   - **Local law or policy.** Rewrite so the answer doesn't hinge on a figure you can't verify (e.g. the nurse's action when
     consent capacity is uncertain). Flag only if that's impossible.
   - **Combination format (I/II/III).** Flag with `needs-jade`. That policy is still open with Ian and Jade.
5. **image**. Retire unless the needed data can be given as plain text in the stem.
6. **negative-stem**. Rewrite in the negative format (REVIEW_BRIEF rule 9).
7. Other or unfamiliar flags. Apply the closest rule above.

A rewrite may change the question substantially (rescoping usually does). Keep the topic and domain. The gendered-pronoun
check compares against the original, so if the original never stated a gender, say "the client".

## Output
Same `.out.json` shape as REVIEW_BRIEF, plus for a retirement:
```json
{"id":"…","source_id":"…","verdict":"retire","retire_reason":"Neonatal ABG interpretation is NICU specialist content with no entry-level RN version.",
 "stem":"","options":[],"correct":[],"rationale_correct":"","option_types":{},"distractor_rationales":{},"changes":""}
```

## Loop
1. Write the whole `.out.json` next to the input (same name, `.out.json`).
2. Run `npx tsx scripts/review-bank.ts --check --in <batch>.out.json`. Fix what it lists until it prints `"failed":0`
   with no BATCH line. Answer-position limits count only `ok` items.
3. Don't edit scripts, rules or the input. Don't run `--apply`. Don't call any AI API.
4. Report in under 150 words: counts of ok / retire / flag; how many keys changed (list source_ids); anything you're unsure of.
