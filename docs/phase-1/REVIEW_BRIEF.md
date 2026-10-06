# Question bank review brief (MCQ standard v0.1)

For an AI reviewer (Claude Code or Kimi Code subagent) revising one batch of existing NRG questions.
You get `<batch>.in.json` and write `<batch>.out.json`. `scripts/review-bank.ts --check` is the gate:
the batch is only applied once every item passes it.

## Who the questions are for
RENR candidates: final-year nursing students sitting the Registered Nurse examination in Trinidad and Tobago /
the Caribbean. Every item tests what an **entry-level registered nurse** should know and do.

## What to do with each question
Keep the clinical point the question tests and its correct answer **unless the key is clinically wrong**. Then:

1. **Never change which answer is keyed correct.** If you believe the key is wrong, outdated or disputed, set
   `verdict: "flag"` with `flags: ["clinical-key"]`, explain in `flag_note`, and include your full proposed rewrite. Jade
   decides. You may reword the correct option, as long as it still says the same thing. Narrowing it ("A or B" → "A"), broadening
   it, or removing part of its content counts as changing the key: flag it.
2. **Scope.** Entry-level registered nurse only. No critical-care / intensive-care content, no nurse practitioner or
   advanced-practice roles, orders or privileges, and no physician-only decisions as the "nursing" answer. If specialist
   information is needed for the decision, give it in the stem. If the item can't be brought into scope without becoming
   a different question, flag it (below).
3. **No visual flagging.** Vital signs, findings and lab values are plain text with identical formatting. No bold, italics,
   arrows, symbols, or labels such as high, low, critical, elevated, normal or abnormal. The student decides what is abnormal. A reference range in plain text, e.g. "(reference 7 to 56 U/L)", is allowed when local units make it necessary.
4. **Units.** Blood glucose in **mg/dL**, never mmol/L (mmol/L × 18, rounded; e.g. 3.1 mmol/L → 56 mg/dL). Update every place
   the value appears, including rationales. Leave electrolytes as they are.
5. **Four options, one of each type** (`option_types`):
   - `correct`: the one best answer.
   - `close`: near-correct, partly right but not the best answer.
   - `priority`: a lower-priority action or a sequencing/timing error (right idea, wrong order or wrong moment).
   - `incorrect`: inappropriate or unsafe, but something a plausible entry-level nurse could still pick. It fails through a
     subtle reasoning error and is never absurd. Replace joke or obviously wrong distractors ("guarantee survival", "ignore
     the client") with plausible ones of the right type.
   Test each distractor before you label it:
   - Would a competent nurse accept it as a reasonable but weaker answer here? → `close`.
   - Is it something the nurse *should* do in this scenario, just not now or not first? → `priority`. Its rationale must
     say when or after what it belongs.
   - Is it wrong or harmful in this scenario at any time? → `incorrect`.
   For knowledge questions with no action sequence, `priority` is a true statement or action that is secondary to the
   point being asked (a later step, a less important fact), never a false one. If an option is false, it is `incorrect`,
   not `close` or `priority`. Rewrite options until each one honestly fits its label.
6. **Parallel options.** Similar length, grammar and level of detail. The correct option must not stand out as the longest.
   Hard limits: every option 8–200 characters; longest ÷ shortest ≤ 1.4; the correct option no more than 12 characters
   longer than the average of the other three. Avoid one-word options (they break the length ratio); write each option as a
   short phrase or action. No "all/none of the above", no "always/never" absolutes.
7. **A rationale for every option**, written for the student. Cite the specific data in the stem. Never use generic text like
   "this misses the priority". The correct-answer rationale (60+ characters) states the principle and why it applies here.
   Each distractor rationale (30+ characters) says why that option is close / lower priority / unsafe *in this scenario*.
   The rationale must match **its own option**: some AI items have rationales attached to the wrong option, so rewrite them
   from scratch rather than trusting the old text.
8. **No invented gender.** If the original question never says the client is male or female, refer to them as "the client"
   (never he/she/his/her). The check rejects pronouns the original did not use. Keep gender where the scenario states it
   (e.g. a pregnant client, "a 63-year-old woman").
9. **Stem.** Clinically realistic, complete, and answerable without reading the options. Caribbean context. Keep
   FIRST / NEXT / PRIORITY framing where it is used. Expand an unusual abbreviation on first use (IV, BP, CPR, ECG, HIV are fine).
10. **Answer position.** You may reorder the options. Across the batch, spread the correct letter roughly evenly over A–D, and keep
   the correct option from being the strictly longest in more than about a third of items.

Don't change domain, taxonomy or difficulty tags; those decisions are pending with Jade.

## When to flag instead of fixing (`verdict: "flag"`)
- **Negative stem** (the question asks which option is wrong, unsafe, to avoid, NOT/EXCEPT/LEAST, or "needs further
  teaching"): flag it with `flags: ["negative-stem"]`. Its distractors are true statements, so it can't be typed honestly.
  How these are handled is pending with Ian and Jade. Don't rewrite it to a positive stem yourself. The check enforces this.
- It depends on an image, chart or table that isn't in the text.
- It is out of entry-level scope at its core (e.g. ventilator management, prescribing decisions).
- The clinical content is disputed or you aren't confident of the correct answer.
- It duplicates another item in the same batch (name its source_id).
- It needs content only Jade can supply.

Use only these flag names: `clinical-key`, `negative-stem`, `scope`, `duplicate`, `image`, `needs-jade`.
A flagged item still needs `flag_note` (one or two sentences: what is wrong and what Jade should decide). If you can also offer
a compliant rewrite, include the full item fields; otherwise leave `stem` empty. Flagged items are set to `needs_changes` and
taken out of circulation; their content isn't changed.

## Output: `<batch>.out.json`
```json
{"items":[{
  "id": "<uuid from the input>", "source_id": "<from the input>", "verdict": "ok",
  "stem": "...",
  "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
  "correct": ["C"],
  "rationale_correct": "...",
  "option_types": {"A":"close","B":"incorrect","C":"correct","D":"priority"},
  "distractor_rationales": {"A":"...","B":"...","D":"..."},
  "changes": "one line: what you changed and why (e.g. 'rewrote absurd distractors; typed options; new per-option rationales; glucose to mg/dL')",
  "flags": [], "flag_note": ""
}]}
```
Every input item must appear exactly once in the output, keeping its `id` and `source_id`.

## Loop
1. Write the whole `.out.json`.
2. Run `npx tsx scripts/review-bank.ts --check --in <batch>.out.json`.
3. Fix only the items it lists (and any BATCH line), then rerun until it prints `"failed":0` with no BATCH line.
4. Don't edit scripts, rules or the input file. Don't run `--apply` (the coordinator does that). Don't call any AI API.
5. Report back in under 120 words: passed / flagged counts, the source_ids you flagged and why, and any clinical changes to a key.
