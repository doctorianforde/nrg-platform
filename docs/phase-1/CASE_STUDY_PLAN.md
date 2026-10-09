# Case study platform: plan

Status: **steps 1–3 built on staging (2026-10-09)**: schema, student runner + end-of-case review, teacher review/validate/publish, JSON import. Step 4 (generator) next. Not on prod. Source documents: `NRG_RENR_Case_Study_Question_Prompt_Format_V3_2_1.md` (Jade's
standard, "V3"), `CASE_REQUEST.md` (request template + error-prevention addendum), `RENR_Case_Study_Lithium_Toxicity_Revised_1.md`
(Jade's worked example).

## What exists today

- `case_studies` (scenario text, domain, active) and `case_study_questions` (links to `questions`): **0 rows** on staging.
- `/study/case-studies` and `/study/case-studies/[id]`: one block of scenario text, then the linked questions in `TutorSession`,
  which gives **feedback after every question**. V3 requires the opposite: no answers, rationales or labels until the case is complete.
- Reusable: `questions` / `question_options` (with `distractor_type` colour classes), the review queue `/teacher/review`,
  the mock-exam gating pattern (results held until release), the MCQ validator (`scripts/lib/mcq-standard.ts`) and the
  subscription-mode generation pipeline (brief → agent writes JSON → validator).

## What V3 asks for

An unfolding case: **opening scenario → staged "NEW INFORMATION" blocks with timestamps → Q1–Q6 in a fixed clinical-judgment order
(Recognize → Analyze → Prioritize → Generate solutions → Take action → Evaluate) → optional Q7–Q8 extensions**. Each question has
one domain, one taxonomy, four options, one best answer. Data are shown raw (no flags, glucose in mg/dL), in structured vitals,
assessment (body-systems order) and lab blocks. After the case, an instructor/answer view shows the key, colour-labelled rationales,
domain/taxonomy/CJ step, then a **pathophysiology teaching section**. Every item carries the metadata in V3 §16 and needs clinical
validation before publication (§14).

## Proposed build

### 1. Data model (staging first, new migration)
- `case_studies`: extend with `case_code` (e.g. NRG-MH-001), `title`, `objective`, `population`, `setting`,
  `primary_condition` (instructor only), `endpoint`, `difficulty`, `status` (draft / in_review / approved / archived),
  `pathophysiology` (markdown), `quality_report`, `validation_status/by/at`, `source` (jade / ai), `created_by`.
- `case_stages`: `case_id`, `stage_order`, `time_label` ("9:30 am", "Day 2, 9:00 am"), `narrative`, and structured
  `vitals`, `assessment`, `labs` (jsonb, ordered) so the app renders identical, unflagged tables.
- `case_study_questions`: add `stage_id`, `position` (1–8), `cj_step`, and the V3 §16 metadata (topic, subtopic, priority principle,
  prerequisites, suggested review). Options and rationales stay in `question_options`, so colours, review tooling and analytics are shared.
- `questions.context` = `standalone | case`, so case items never leak into practice, flashcards or mock-exam pools (they need the case to make sense).
- `case_attempts` + `case_attempt_responses`: one attempt per run, answers per question, score, and per-CJ-step results.
- Rationales are released only for a completed attempt, enforced server-side (same approach as mock-exam release).

### 2. Student experience
- Case list (title only; no diagnosis), then a runner: opening scenario, then each stage revealed with its time label and
  "NEW INFORMATION" marker. Everything revealed so far stays visible in a case-record panel (vitals over time, assessments, labs).
- One question at a time, answered against the information shown so far. No feedback, labels, domain or taxonomy during the case.
- End of case: score, per-question answer + colour-labelled rationales (text label always shown), domain/taxonomy/CJ step,
  then the pathophysiology section and suggested review. A "your clinical-judgment profile" summary (e.g. strong on Take Action,
  weak on Analyze Cues) feeds the existing analytics/XP.

### 3. Teacher / Jade review
- Case queue alongside `/teacher/review`: student preview, instructor view, the quality-test report, edit, approve/publish.
- Publishing requires `validation_status = validated` (V3 §14).
- Export to PDF (student + instructor views) for offline review, reusing the PDF builders.

### 4. Generation pipeline
- `scripts/generate-case.ts`: takes a CASE_REQUEST (fields from the template), builds the V3 + addendum prompt, and accepts the
  case as one JSON document (same three modes as the question pipeline: Claude Code / Kimi Code via a brief, or any API).
- Case validator (extends the MCQ validator): 6–8 questions in CJ order; one domain + one taxonomy each; four options, one key;
  rationale for every option; no visual flags; glucose in mg/dL; no reference ranges unless the objective is range recall;
  every option ≤ length rules; required metadata present; self-test sentence present for each question (addendum #5) and must not
  contain "obviously"/"clearly"; fluid/electrolyte data present when the case involves renal, cardiac, electrolyte-active drugs or IV
  therapy (addendum #3). Checks needing judgment (cue sufficiency, hidden assumptions, two-answer test) go to a second-pass reviewer
  agent and the quality report, then to Jade.
- Blueprint tracking for the case bank: NP 35 / CDM 35 / HPMW 10 / others 5 each; taxonomy KC 10 / AP 40 / ASE 50.

### 5. Order of work
1. Decisions below + Jade's answers to the spec gaps.
2. Migration + seed the lithium case (after Jade approves the fixes listed below) → student runner + end-of-case review.
3. Teacher review/preview/publish + JSON import.
4. Generator + validator + reviewer agent; first batch of AI cases for Jade.
5. Analytics; prod migration and launch.

## Decisions (Ian, 2026-10-08)
1. **Answers lock** when the student advances to the next stage. Later questions stay answerable even if an earlier answer was wrong.
2. **Feedback at the end of the case only.** No answers, rationales, labels, domain or taxonomy during the case. This replaces the
   current per-question feedback on `/study/case-studies/[id]`.
3. **Flexible option types** in case questions: correct / close / priority / incorrect / **unsafe** as fits each question
   (V3 §9). The standalone bank keeps its one-of-each rule. Needs `unsafe` added to `distractor_type` (red, labelled "Unsafe").
4. **Paid tiers only:** `standard` and `premium` students (staff always). Free students see the case list with a locked state.
   Tiers are set by admins today; there is no payment flow yet.

## Questions for Jade (spec gaps and conflicts)
1. **Section 7.6 "Prohibited Stem Verb"** is an image that didn't come through. We need the verb list as text to build it into the validator.
2. **Reference ranges:** the addendum says none unless range recall is being tested; V3 §5.3 allows them "when educationally necessary".
   The bank review added plain-text reference ranges to some standalone questions when it removed "(high)/(low)" labels. Which rule
   applies to standalone questions?
3. **Domain weights differ by bank:** cases NP 35 / CDM 35 (V3 §2.1) vs the RENR guide for the question bank. Confirm this is intended.
4. **Numbering:** two sections are numbered 7.6, and §17's steps restart at 10. Cosmetic, but the prompt is fed to the AI verbatim.

## Points to raise on the lithium example before it is seeded
- **Q4 and Q5 have nearly the same key** ("withhold the next dose pending physician review" vs "withhold the midday dose and report").
  V3 §7.4 wants planning and action distinct; Q4 could target an outcome or monitoring plan instead.
- **Q6 evaluates care that was never shown:** "she received IV fluids at the district hospital yesterday" appears for the first time in
  Q6's new information. V3 §6: "every intervention must be introduced before it is evaluated".
- **Some distractors fail the addendum's own plausibility test:** Q4(D) "increase the lithium dose", Q5(D) "arrange transport before
  informing anyone", Q8(A) "stop lithium once mood is stable" read as obviously wrong to most entry-level nurses.
- **Q1:** a fine tremor can occur at therapeutic lithium levels; the key is defensible, but the rationale should say why it's the
  safety cue here (new, with vomiting and poor intake), not just "new abnormal sign".
- Clinical validation of thresholds and standing-order scope is still pending (the document says so itself).

## Built (2026-10-09, staging)
- Migration `20261009003423_case_study_platform`: `questions.context` (case items never enter practice/mock/review pools),
  `unsafe` option type, case header fields + status/validation (a case cannot be live unless approved **and** validated —
  enforced by a CHECK constraint), `case_stages`, `case_attempts`, `case_attempt_responses`, and two SECURITY DEFINER functions:
  `start_case_attempt` (standard/premium or staff only) and `answer_case_question` (grades server-side, enforces question order,
  locks answers — students have no insert/update policy — and closes the attempt with a score).
- `scripts/lib/case-standard.ts` (format + validator) and `scripts/import-case.ts` (staging only; lands cases as in_review, inactive).
- Student: `/study/case-studies` (list, plan lock) and `/study/case-studies/[id]` (intro → runner with a growing case record →
  results: clinical-judgment profile, colour-labelled rationales, full case record, teaching review, retake). Answers, rationales,
  option types and metadata are stripped server-side until the attempt is complete.
- Teacher: `/teacher/case-studies` (list) and `/teacher/case-studies/[id]` (instructor view, quality report, record validation,
  publish/unpublish/archive, preview as a student). Nav link added.
- Seed: `content/case-studies/NRG-MH-001.json`, the lithium case with Claude's corrections, imported to staging as in_review.
- Tested end to end in a browser against staging with two staging test accounts (`case-test-teacher@…`, `case-test-student@…`).
- Known limitation, same as the rest of the app: `case_studies`/`case_stages`/`question_options` are readable by any signed-in user
  through the API, so a determined student could read keys or later stages directly. The UI never sends them early. Tightening RLS
  for case content is a follow-up.
