# NRG Platform — Progress Log

Client: Jade Nicome · Developer: Dr. Ian A. Forde II
Stack: Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth) · Vercel
Repo: `~/Desktop/NRG`

This file is the durable, portable record of what's actually been done — meant to be
readable by any AI tool (Claude, Kimi, Qwen, whatever) or by a human, without needing
prior chat history. Update it at the end of each work session. Task IDs (T01, T25, …)
refer to the tracker in `PLAN.md`.

---

## Current state (as of 2026-09-18)

**Database schema (Week 1 — T01–T14): done.** Both `nrg-platform-staging`
(`kwhaqhhwqykckarjbdod`) and `nrg-platform-prod` (`cdvubijjepwmhhkgppbl`) have the
full schema: `domains` (7 official RENR domains), `topic_clusters` (5: MEDSURG,
SAFETY, MATCHILD, MGMT, PSYCHSOC), `topics`, `questions`, `question_options`, `tags`,
`question_tags`, `profiles`, flashcards/case-study tables, mock exam tables, RLS
policies, `public.user_role()` helper, signup trigger, and full-text search on
questions.

**Auth (Week 2 — T15–T24): mostly done.** Email provider, redirect URLs, signup
trigger, `user_role()`, auth middleware, role-based routing, and `useUser` hook are
all in place (`src/lib/auth/`, `middleware.ts`). **T16 (email templates) was still
marked pending as of the last tracker snapshot — verify before considering Week 2
closed.**

**Content migration (Week 3 — T25–T35): done, verified clean in prod.**
- Parsed Jade's real 100-question RENR file (`NRG RENR Sample Questions #1.docx` +
  `NRG RENR Sample Answers #1.docx`) into a clean 100-row CSV after fixing a
  docx-embedded-linebreak parsing bug (9 questions were silently dropped by the
  original regex; fixed, re-validated, 100/100 parsed with 0 errors).
- Extended `scripts/migrate-questions.ts`'s `CLUSTER_ALIASES` map with `leadership`
  and `prioritization` → `MGMT`, to cover categories only present in Jade's real
  content. Committed as `a93d7b5`, pushed to `origin/main`.
- All 100 real questions were migrated to **both staging and prod**, tagged
  `Author: Jade Nicome` (kept separate from the earlier `Author: AI-generated` tag
  applied to the 2,000 AI-generated questions already in the DB).
- Migration replayed as raw SQL via the Supabase MCP connector rather than running
  the TS script live, because neither the cloud sandbox nor the local device-bash
  shell can reach `*.supabase.co` (network egress blocked by proxy in both). The SQL
  was hand-verified to replicate the script's exact upsert logic (topics, questions,
  options wholesale-replace, tags) including the partial-unique-index fix below.
- **Schema gotcha discovered and fixed:** `public.questions.source_id` has a
  *partial* unique index (`WHERE source_id IS NOT NULL`), not a plain unique
  constraint — any `ON CONFLICT (source_id)` must be written as
  `ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE ...` or Postgres
  rejects it with `42P10`.
- **Prod verification (final):** 100 questions / 400 options (exactly 4 per
  question) / 0 missing topic or domain links / 0 wrong-option-count / 0
  wrong-correct-count / 100 tagged. DB totals: 2,100 questions, 249 topics, 2 tags.

**AI-generated question bank:** 2,000 questions exist in prod
(`is_ai_generated=true`), generated via `scripts/generate-questions.ts` against the
RENR domain × taxonomy × cluster distribution. Confirmed 2026-09-19: all 2,000 sit
`is_active=false` as designed, pending teacher review (Jade's 100 real questions are
the only `is_active=true` rows — 100/2,100 total). **The review UI (`/teacher/review`)
is live on both prod and staging** — see that section below. *(Counts in this paragraph
are the 2026-09-18 snapshot; prod now holds 2,460 questions with 460 live, after the
provenance fix. Jade's review of the imported prototype bank should happen on staging.)*

## T34 — RLS end-to-end test: done (Kimi, staging, 2026-09-19)

Ran via `scripts/e2e-rls-test.mjs` against staging with real JWT sessions for
student/teacher×2/admin plus anon — 15/15 assertions passed, no policy fixes needed.
Two non-blocking findings need your decision (not yet actioned): students can read
inactive questions under the current policy qual, and `anon`/`authenticated` hold
broader table-level grants than RLS strictly requires (defense-in-depth candidate).
Full detail in `PLAN.md` and `VALIDATION_REPORT.md`.

## T33 — Sample QA tooling: script done (Claude, 2026-09-19); human check still pending

Added `scripts/qa-sample.mjs` (read-only, GET-only). It pulls a seeded random sample
(default 20) of Jade's `jade:nrg-sample-1:*` questions from Supabase and prints each
next to its row in `scripts/data/jade-nrg-sample-1.csv` as a markdown checklist, with
automatic DB-vs-CSV flags for question, each option, answer key, explanation,
cognitive level, `Author: Jade Nicome` tag and active/AI-generated state. It also
checks all 100 rows for only-in-CSV / only-in-DB mismatches.

- Defaults to **staging** (holds the same 100 Jade rows as prod), so no prod
  credentials are needed. `--env prod` exists but has not been run.
- Run: `node scripts/qa-sample.mjs --seed 42 --out qa.md` (`--count 100` for all).
  Exit code is 1 if anything is flagged.
- Test run on staging (seed 42, 20 questions): 0 auto-flags, 100/100 population
  match. A doctored CSV copy was correctly flagged (changed option text and changed
  answer key), so the diffing works.
- **Limit:** the CSV was itself parsed from the docx, so a clean run proves the
  *migration* was faithful, not the *docx→CSV transcription*. Ian (or Jade) still has
  to read each block against `NRG RENR Sample Questions #1.docx` and `Sample Answers
  #1.docx`. That human check is what closes T33.
- Committed as `f1d4d95`, since pushed to `origin/main`.

## Question review section (Claude, 2026-09-19) — LIVE ON PROD

> Status corrected 2026-09-24: `20260919010000_question_review_workflow.sql` is applied to
> **both** staging and prod (verified against `supabase_migrations.schema_migrations` in each),
> and `/teacher/review` ships in the deployed build. The "staging only" wording below was
> written before the 2026-09-20 prod deploy and never updated.

Lets Jade evaluate the 2,000 AI-generated questions in the app instead of raw SQL.

- **Schema** — `supabase/migrations/20260919010000_question_review_workflow.sql`:
  `questions.review_status` (`pending|approved|needs_changes|rejected`, default `pending`),
  `reviewed_by`, `reviewed_at`, `review_notes`; Jade's 100 human questions backfilled to
  `approved`. New CHECK `questions_ai_active_requires_approval`: an AI question can only
  be `is_active` when `approved` (verified: activating an unapproved one returns 23514).
  `can_manage_question()` now also lets **teachers** edit AI-generated questions
  (previously teachers could only edit rows they created, and AI rows have
  `created_by = NULL`, so Jade could not have acted on them). Jade's 100 stay admin-only
  for teachers. **Applied to staging only** (via `supabase db push --db-url`, dry-run
  first). Prod still needs it — Ian's go-ahead required (needs the prod DB password).
- **UI** — `/teacher/review` (progress bar + per-status counts, filters: status, domain,
  clinical area, cognitive level, difficulty, text search, 25/page) and
  `/teacher/review/[id]` (question, options with per-option rationales, explanation,
  reviewer notes; Approve / Needs changes / Reject → next in the current filter, Skip,
  Reset to pending, inline edit of stem/options/correct answer/rationales/explanation/
  level/difficulty, "Save edits only"). Approve sets `is_active=true`; every other
  decision keeps it inactive. Needs-changes requires a note. Stale-edit protection via
  `updated_at` (a second reviewer's change is never silently overwritten). Code in
  `src/app/teacher/review/`, `src/lib/review/`. `/teacher` dashboard links to it with
  the pending count. Also added `src/lib/**` to `tailwind.config.ts` content globs.
- **Testing (staging, real browser via Playwright + Chrome, temp teacher account)**:
  22/22 checks passed — auth redirect, filters, approve, needs-changes with/without
  notes, edit+save (DB rows verified), reject, stale-form conflict, reset, 404 on
  human-authored questions. `next build` + `next lint` + `tsc` clean. T34 RLS suite
  re-run after the policy-function change: 15/15. Test data restored afterwards
  (staging: 2,000 pending, 0 active; temp user deleted).
- **Known limits / not built:** no bulk approve (deliberate — clinical content), no
  keyboard shortcuts, options can be edited but not added/removed, no audit history
  (only the latest reviewer/timestamp/notes are kept), SATA editing untested (all 2,000
  are single-answer MCQ). The `src/lib/supabase/types.ts` review columns were added by
  hand — regenerate after the prod migration.
- **Related open decision (T34 finding #1):** RLS still lets any signed-in student read
  inactive questions via the API, so pending/rejected AI questions are readable by
  students until the read policy is tightened. Now more relevant than before.
- **To go live for Jade:** (1) Ian OKs the migration on prod, (2) deploy the app,
  (3) promote Jade's prod account to `teacher` (or `admin`) with SQL, (4) he opens
  `/teacher/review`. Committed as `6927c9e`, since pushed to `origin/main`.

## Frontend build-out (Kimi, 2026-09-19): /study, dashboards, mock exam UI — built AND restyled to the reference design

Built against the real schema (no migrations needed). Verified after both passes: `tsc --noEmit`,
`next lint`, `next build` all clean (20 routes). Not committed to git as of this entry.

- **Design foundation** — real tokens/assets extracted from the OKComputer_NRG_Website_v62
  reference (per Ian: reference only, no code port): images + logo + correct/wrong MP3s
  copied to `public/`, font stack (Inter/Poppins/Nunito Sans) via `next/font`, Tailwind theme
  rebuilt on the reference's actual CSS variables (primary `#6b2d8b`, brand-50…950, gold,
  radius .625rem). Shared primitives: `src/components/ui/` (Card, Badge, StatCard,
  EmptyState), `src/lib/cn.ts`, question components in `src/components/questions/`
  (OptionRow, QuestionMetaBadges, RationalePanel, TutorSession), `src/lib/quiz/`.
- **/study** — lobby (mode cards, per-domain active-question counts), practice setup +
  tutor-mode session (instant feedback, explanation + per-option rationales, correct/wrong
  sounds), flashcards (topic picker, CSS flip deck, shuffle), case studies (scenario +
  linked questions in tutor mode). Student queries always filter `is_active=true` at the
  app layer (T34 finding #1 not yet decided, so we filter in code).
- **/teacher** — dashboard (review-queue StatCards, needs-changes banner, quick links);
mock exam set management (create set, add/remove active questions via search, sessions
table; deliberately no student names — RLS blocks cross-profile reads for teachers).
- **/admin, /super-admin** — read-only dashboards: user/role counts, recent signups
  (admin only), questions per domain, content totals, environment refs. Deliberately NO
  role-promotion UI (README says SQL-only; Ian's call).
- **Mock exam UI (student + teacher)** — business rules enforced at the app layer: exam
  runner gets a sanitized payload (no is_correct/explanation/rationale in the browser
  bundle during an open exam), zero feedback while answering, grading stays in the DB
  (trigger + `complete_mock_exam_session` RPC), rationales shown post-exam ONLY when
  `mock_exam_sets.rationale_released_at` is set, release is a deliberate teacher button
  (one-way; re-lock is admin-only per DB trigger, no UI for it).
- **Open questions flagged for Ian** — (1) analytics/rank pages from the reference have
  no backing tables in our schema; not built, needs a data-model decision; (2) role-
  promotion UI; (3) practice sessions are not persisted (no table) — add later if history
  matters; (4) landing-page pricing cards use the prototype's prices ($29/mo, $69
  one-time) — confirm with Jade before enabling payments.

## Design restyle pass (Kimi, 2026-09-19) — done

The design spec was extracted from the running prototype (live screenshots of all 11
routes + interaction flows; serve needed `-s` for SPA deep links and had to move off
4173, which was occupied by an unrelated dev server) and saved durably as
**`docs/design-spec-okcomputer.md`** — page-by-page layouts, tokens, and the 11 reusable
patterns. Restyle applied across the app on top of it:

- **Shared chrome** — `DashboardShell` now has the reference's sticky blurred navbar +
  purple gradient page banner (new optional `eyebrow`/`subtitle` props used on all
  dashboards); `StatCard` gained the tinted-icon-square pattern (`icon`/`iconTone`).
- **Landing page rebuilt** — hero with `hero-students.jpg` + floating pass-rate/improvement
  cards, real stats band (live topic/question/domain counts), feature grid on the
  reference images, RENR domain weights with progress bars (real `exam_weight_pct`),
  journey stepper, why-active-learning section, testimonials, pricing, final CTA, dark
  purple footer, and the floating "Nursing Knowledge" flip-widget.
- **/study** — practice setup restructured to the reference's two-column filter +
  sticky session-summary pattern; flashcards/case-studies restyled (scenario card with
  purple accent border; list cards with pill badges).
- **Mock exams** — exam-card grid with play/lock badges, slim sticky in-exam top bar with
  progress line, score-hero results; teacher pages got stat tiles + clean tables.
  Restyle was markup-only: the sanitized-payload rationale gate is untouched.
- **Dashboards** — review-queue tiles with semantic icon tones, admin recent-signups as an
  avatar + pills table, super-admin environment info card.
- Reference features with **no backing schema** were NOT approximated with fake data:
  study lobby (group rooms), analytics charts, rank/Elo system, question-generation
  authoring flow, case-study vitals/phases — all documented in the spec, all need Ian's
  data-model/product decisions first.

## Fatigue analysis (Claude, 2026-09-19) — LIVE ON PROD

> Status corrected 2026-09-24: this needed no migration, only a deploy, and the code has
> been on `origin/main` since the 2026-09-20 push that deployed both Vercel projects.

Implements the client's `Fatigue_Analysis_Data_Prompt.docx` (kept in the repo root).
That spec was written against a prototype that held the whole exam in memory, so it
needed adapting rather than transcribing. No schema change — it reads what
`mock_exam_responses` already stores.

**Where it appears**
- Student: `/study/mock-exams/session/[id]` after submitting — a four-quarter card
  grid with the spec's colour rules (green 70+, amber 50+, red below), drop badges,
  the red final-quarter banner, and one recommendation.
- Teacher: `/teacher/mock-exams/[id]` — "Cohort fatigue", the class distribution
  across completed attempts.
- Logic: `src/lib/mock-exam/fatigue.ts` (pure, no React, no DB).
  UI: `src/components/mock-exam/`. Tests: `npx tsx scripts/test-fatigue.ts` (38 checks).

**Kept from the spec:** quarter segmentation, the 15-point drop line, the 70/50
colour thresholds, the drop badge, the final-quarter warning banner, and the four
recommendation categories.

**Changed, and why**
1. *Segments come from the set's real length*, not a hardcoded 100 questions / 25 per
   quarter. Our sets are any size; a 37-question set splits 9/9/9/10.
2. *Correctness reads `mock_exam_responses.is_correct`*, graded in Postgres by
   `trg_grade_mock_exam_response`. The spec compared one selected index against one
   correct index, which cannot express SATA and would mean shipping the answer key to
   the browser — the exam runner is deliberately built never to receive it.
3. *Accuracy is measured over ANSWERED questions; skips are counted separately.* The
   spec's prose said the same but its code counted every slot in the range, so a
   skipped question was scored wrong and a tiring student was penalised twice over.
   Rising skips are themselves a fatigue signal and are reported on their own terms.
4. **A 15-point gap is inside the noise band.** This is the substantive change. At 25
   questions a quarter the two-proportion standard error is ~13 points, so the spec's
   flat 15-point rule fires on chance roughly a quarter of the time even when nothing
   is wrong. Quarters are now labelled `Lower` (amber) at 15+ points — the client's
   line, preserved and visible — and `Drop` (red) only when the fall also clears
   sampling error (one-sided 95%). Only a red drop triggers the warning banner. Without
   this the product tells students to change how they study on the strength of a coin
   flip.
5. *Pattern and recommendation are computed in code*, not by an LLM. The spec's
   section 7 prompt asked a model to sort four numbers against four fixed rules; in
   code that is deterministic, free, instant, and unit-testable. It also needs no API
   key at runtime and cannot return different advice for the same exam twice.

**Dropped, and why**
- *The 0–100 instructor "fatigue score" and its bands (0–29 / 30–59 / 60+).* The spec
  never defined how the score was produced — in the prototype it was mock data.
  Replaced with a measured quantity: points between a student's first and last
  quarter, banded under 10 / 10–19 / 20+.
- *`Estimated accuracy penalty: -Math.floor(fatigue * 0.3)%`.* An invented formula
  with nothing behind it. Showing a teacher a fabricated prediction is worse than
  showing nothing, so the card reports the drop actually observed.
- *The fixed class figures* (18/22/8 students, "average class stamina 41"). Prototype
  placeholders; the cohort card computes real counts.

**Added (the schema allows what the prototype could not)**
- *Pace per quarter* from `answered_at`. Withheld when the timestamps aren't
  monotonic, because `saveResponse` rewrites `answered_at` on every save, so a
  revisited question carries a later stamp than the questions after it. In that case
  the card says why instead of showing a wrong number.

**Testing**
- 38 unit checks, no DB or network: `npx tsx scripts/test-fatigue.ts`.
- Browser end-to-end on staging (Playwright + Chrome), 21 checks: three seeded
  100-question attempts (late cliff with skips, steady slide, steady with a revisit)
  read back through the real student and teacher pages. `next build`, `next lint` and
  `tsc` all clean. Seeded exam data and temp users deleted afterwards — staging is
  back to 0 mock exam sets / sessions / responses.
- Two real bugs were caught this way and fixed: a steady slide was classified as a
  late drop, and then an 88/84/78/35 attempt (a mild slide ending in a 43-point cliff)
  was classified as gradual and told the student their accuracy "edged down ... rather
  than falling off a cliff". Both are now regression-tested.

**Limits worth knowing**
- Segment accuracy counts only answered questions, so it deliberately won't match the
  headline score when questions were skipped. The card says so.
- The cohort card is anonymous: RLS lets teachers read sessions but not other users'
  profiles, so no student names. Naming students there needs a `profiles` policy
  change — Ian's call, same family as the T34 finding.
- Nothing tracks fatigue across attempts over time; each report is one sitting.
- Exams under 16 questions get no analysis at all — quarters would be meaningless.

## Student profile + messaging (Claude, 2026-09-19) — LIVE ON PROD

A student profile section with a direct line to teaching staff, so students can ask
Jade questions and get feedback in the app.

**Where it appears**
- Student: `/study/profile` — their details, an editable display name, mock exam
  stats, a "Ask your teacher" form, and their conversations.
  `/study/profile/threads/[id]` is the conversation itself.
- Student: the mock exam results page gained an "Ask your teacher about this
  attempt" button, which opens the profile with that attempt already attached.
- Teacher: `/teacher/messages` inbox and `/teacher/messages/[id]`; the teacher
  dashboard shows an unread banner and a quick link.
- Code: `supabase/migrations/20260919020000_student_messaging.sql`,
  `src/lib/messages/`, `src/components/messages/`, the two route folders above.

**Shape (Ian's two calls, 2026-09-19)**
1. *Threads that can cite an attempt.* A student opens a thread with a subject and
   an optional `mock_exam_sessions` reference, so Jade can see the result being
   asked about. A DB trigger rejects citing an attempt belonging to anyone else.
2. *Teachers see only students who have written to them.* The guiding rule is
   **you can see someone's name if you share a conversation** — which is symmetric,
   so a student can also see the name of the teacher who replied, and nothing wider.

**Schema**
- `message_threads` — student_id, subject, optional session_id, status
  (`open|answered|closed`), `last_message_at`, and a read marker per side.
- `messages` — thread_id, author_id, body. Append-only: no UPDATE grant or policy
  on either table, so a feedback record can't be edited after the fact.
- Posting is handled by `trg_touch_message_thread`, which bumps the thread, flips
  status (student posts → `open`, staff posts → `answered`) and marks the author
  caught up. Read state is stamped by the `mark_thread_read()` RPC rather than an
  UPDATE policy, so neither side needs write access to the threads table.
- **`profiles` SELECT policy replaced.** Was own-row-or-admin, which meant a teacher
  could not see who was writing to them — messaging is impossible without changing
  it. Now own row, or admin, or `shares_thread_with(id)`. Threads are
  student-initiated only, precisely because staff still cannot browse the roster.

**Testing (staging)**
- 30 checks, browser + API (Playwright + Chrome, real JWTs): the whole round trip
  (student asks with an attached attempt → teacher inbox shows their name → reply →
  student sees it, unread clears), plus every boundary:
  another student gets 404 on the thread and 0 rows from the API; cannot post into
  it; cannot post under someone else's name; cannot cite another student's attempt;
  cannot open a thread on another student's behalf; threads reject student UPDATE.
  Profile visibility verified in all four directions — teacher CAN read a student who
  wrote in, CANNOT read one who did not; student CAN read the teacher who replied, an
  uninvolved student CANNOT.
- T34 RLS suite re-run after the profiles policy change: still 15/15. It passes
  because nobody shares a thread in that test, which is exactly the intended
  behaviour.
- `next build`, `next lint`, `tsc` clean. Fatigue unit checks still pass. All seeded
  users, threads and exam data deleted — staging is back to 0 rows on every table.
- One real bug caught and fixed: the reply box kept its text after sending, because
  a successful action returned `null` — the same value the form started with, so the
  reset effect never re-fired. Success is now its own state.

### Follow-up, same day: staff can start conversations (`20260919030000`)

Ian asked for Jade to be able to reach out first, which needs a roster, so the
profiles policy is wider than the original decision 2: **a teacher may now read
every student profile**, not only students who have already written in. Staff
profiles stay private from each other, and students still see staff names only
along a shared thread. `/teacher/messages` gained a "Write to a student" form;
`trg_validate_thread_session` now also rejects a thread whose owner is staff.

This deliberately changes a T34 assertion. `scripts/e2e-rls-test.mjs` previously
asserted "teacher cannot read all profiles" (exactly 1 row); it now asserts the
teacher reads students plus their own row but **not** other teachers or admins —
still 15/15. Verified with 14 further browser/API checks: the roster lists students
and excludes staff, the student receives and can reply to a teacher-started thread,
students still cannot read the roster, and a teacher cannot open a thread owned by
staff (403).

**Limits worth knowing**
- No notifications outside the app (no email/push); unread is shown on the dashboard.
- No attachments or images, and no typing/delivery indicators. Threads are not
  closable from the UI yet, though the DB and UI both honour `closed`.
- `src/lib/supabase/types.ts` was hand-edited again for the two new tables:
  `supabase gen types` needs Docker, which isn't set up on this machine.
### Shipped to prod, 2026-09-19

Both migrations (`20260919020000`, `20260919030000`) applied to
`cdvubijjepwmhhkgppbl` after a clean dry run — prod migration history is 19/19 with
no drift, and `db push --dry-run` now reports "up to date". Vercel deployed `main`
automatically; `/study/profile` and `/teacher/messages` are live and correctly
redirect signed-out visitors to `/login`.

Smoke-tested against **prod** with a temporary student and teacher (10 checks, all
passing): student opens a thread, posts, teacher sees it with the student's name and
status flipped to `open`, teacher replies, trigger flips to `answered`, student reads
the teacher's name, `mark_thread_read()` returns 204, and a teacher can open a thread
first. Both temporary users deleted afterwards — prod is back to 1 profile (Ian),
0 threads, 0 messages.

**The one thing still needed to use it:** prod has exactly one account, Ian's, and its
role is `student`. Nobody can reach `/teacher/messages` until an account is promoted.
Once Jade signs up at `https://nrg-platform.vercel.app/signup` and confirms his email,
run this in the prod SQL editor:

```sql
update public.profiles set role = 'teacher'
 where id = (select id from auth.users where email = '<jade@email>');
```

The role guard trigger allows this from the SQL editor (`auth.uid()` is null there).
There is no self-service path to a teacher role, by design.

- If prod deploys before the migration is applied, the pages degrade to empty rather
  than erroring (the queries return no rows), but nothing can be sent.

## Teacher approval + account admin (Claude, 2026-09-19) — LIVE ON PROD

Signup now asks whether you are a student or a teacher. Students get in; teachers
get a *request* an admin approves. Plus account management: change role, suspend
sign-in, delete.

**Interpretation flagged:** the ask said "if they select student an email is sent",
but the same sentence ends "approve or deny **teachers**", so the approval gate is on
the teacher choice. Students self-serve, as before — gating them would block the
paying side of the platform. Say the word if that's wrong.

**Where it appears**
- `/signup` — a student/teacher choice, student preselected. The teacher option is
  labelled "Needs approval before it is granted", and the confirmation screen says
  they start with student access while Jade or Ian review it.
- `/admin` — "Teacher access requests" (approve/deny with an optional note, kept on
  the record) and a "People" table: change role, suspend or restore sign-in, delete.
  Reachable by admin and super_admin.
- Code: `supabase/migrations/20260919040000_teacher_approval_and_admin.sql`,
  `src/lib/admin/`, `src/components/admin/`.

**Ian and Jade as super admins**
`admin_contacts` holds `doctorianforde@gmail.com` and `jadenicome1@gmail.com`. It does
two jobs: an address in it is promoted to `super_admin` automatically when it signs
up, and it is the recipient list for request notifications. Ian's existing prod
account is promoted by the migration itself. Jade needs no manual SQL — he just signs
up and lands as a super admin. Verified on staging: signing up with Ian's address
produced `role=super_admin` with no intervention.

**Schema**
- `role_requests` — user_id, requested_role (only `teacher` today), status
  (`pending|approved|denied`), note, decided_by/at. A partial unique index allows at
  most one open request per person. No INSERT or UPDATE policy: rows are created by
  the signup trigger and decided only through `decide_role_request()`.
- `handle_new_user` extended: reads `requested_role` from signup metadata, records a
  request for `teacher`, and promotes an `admin_contacts` address to `super_admin`.
  Self-service signup still can never grant a role — the T12 privilege guard blocks
  that, and this trigger only ever writes `student` or the bootstrap `super_admin`.
- `profiles.suspended_at` — read by `requireRole()`, which now turns a suspended
  account away with `?error=suspended`. The authoritative block is an auth-level ban
  set through the admin API; this column is what the app and admin screen read.
- **Deletion semantics**, decided deliberately: a person's own history follows them
  (`mock_exam_sessions` and `messages` now cascade), authored questions survive
  unattributed (`questions.created_by` → SET NULL), and owning a mock exam set
  *blocks* deletion — a paper other students have sat shouldn't vanish with its
  author, so the UI says to suspend or reassign instead.

**Guards** (all re-checked server-side; the UI is not the gate)
Admin-only actions; you cannot act on your own account; only a super_admin can create
admins or change another super_admin; deleting requires typing the account's email.

**Email**
`src/lib/admin/email.ts` posts to Resend when `RESEND_API_KEY` is set and silently
skips otherwise — no SDK, one fetch, and a mail failure can never break signup. Set
`RESEND_API_KEY` (and optionally `RESEND_FROM`) in Vercel to turn it on; until then
the in-app request list is the channel. The notify call runs after signup, before the
address is confirmed, so it can't require a session — it therefore verifies the
address really has a pending request before sending, so it can't be used to mail the
admins on demand.

**Testing (staging)**
- 18 browser/API checks on the admin flow: bootstrap promotion, request listed with
  name and email, approve grants the role, request clears, suspend records and
  actually blocks sign-in, restore re-enables it, demote works, delete is disabled
  until the email is typed then removes the account, your own row offers no actions,
  and a student is redirected away from `/admin`.
- 6 checks on the signup form: the choice is offered with student preselected, the
  teacher option is labelled as needing approval, `requested_role` is transmitted
  correctly for both choices, the name is trimmed, and the teacher confirmation
  explains the wait. The Supabase call is stubbed in that test — see below.
- 6 checks on deletion cascades: deleting a teacher who wrote a message succeeds and
  leaves the student's messages intact; deleting the student takes the thread with it.
- T34 RLS suite still 15/15; fatigue unit checks still pass; `next build`, `next lint`
  and `tsc` clean. All staging users deleted afterwards.

**Limits worth knowing**
- **Supabase's built-in email is rate-limited** (a handful per hour), and staging hit
  that ceiling during testing — public signup then fails with "email rate limit
  exceeded". Real signups need custom SMTP configured on the Supabase project before
  launch. This is the same area as the still-unverified T16 email templates.
- Supabase also rejects `@example.com` on public signup, so end-to-end signup tests
  can't use the `e2e-test.example.com` addresses the other suites rely on. The form
  test therefore stubs the Supabase call and asserts the payload; the trigger side is
  covered by the seeded tests, which use identical metadata.
- Only `teacher` can be requested. Admin is granted by a super admin from the People
  table, never requested.
- `admin_contacts` is seeded by migration; adding a third platform admin means an
  INSERT (super_admin only) rather than a UI.
- Suspension relies on an already-issued access token expiring (~1h) for the DB API;
  page loads bounce immediately.
- `src/lib/supabase/types.ts` hand-edited again — `supabase gen types` needs Docker.

### Shipped to prod, 2026-09-19

`20260919040000` applied to `cdvubijjepwmhhkgppbl` after a clean dry run; prod
history is 20/20 with no drift and `db push --dry-run` reports "up to date". Vercel
deployed `d0337b9`. Verified on prod: `admin_contacts` holds both addresses, **Ian's
account is now `super_admin`**, and a smoke test confirmed a teacher signup lands as
a student with a pending request while a student signup creates none and is not
promoted. Both temporary accounts deleted — prod is back to 1 profile, 0 requests.

**Jade still needs to sign up.** He goes to `https://nrg-platform.vercel.app/signup`,
picks either option, and lands as `super_admin` automatically because his address is
in `admin_contacts` — no SQL needed, and the choice on the form is irrelevant for him.

**Two things for Ian before real signups:**
1. Configure custom SMTP on the Supabase project. The built-in sender is capped at a
   few emails an hour, and confirmation emails simply fail past that.
2. Optional: set `RESEND_API_KEY` in Vercel to turn on the "a teacher is waiting"
   email. The in-app list at `/admin` works regardless.

## Profile pictures (Claude, 2026-09-19) — LIVE ON PROD

`profiles.avatar_url` has existed since T09 but nothing ever wrote to it. This adds
the storage behind it and shows the picture wherever a person appears.

**Where it appears**
- Upload/change/remove on `/study/profile` under "Your details".
- Shown in the header on every page, the teacher message inbox, conversation
  bubbles, and the admin People table. Falls back to initials on a per-person
  colour, so an unpictured account still looks deliberate.
- Code: `supabase/migrations/20260919050000_avatar_storage.sql`,
  `src/components/ui/Avatar.tsx`, `src/app/study/profile/AvatarUpload.tsx`,
  `saveAvatar`/`removeAvatar` in `src/lib/messages/actions.ts`.

**How it works**
- Bucket `avatars`, public-read, **2 MB and images-only enforced by the bucket
  itself** (`file_size_limit` / `allowed_mime_types`), not merely by the form.
- Files live at `<user_id>/avatar.jpg`, so the first path segment is the owner and
  the storage policy (`(storage.foldername(name))[1] = auth.uid()::text`) means a
  person can only write inside their own folder. Verified: another signed-in user
  uploading to someone else's path gets a 400.
- Public-read rather than signed URLs: an avatar is shown next to its owner's name
  wherever they appear, so there is nothing to protect, and a signed URL would
  expire mid-page.
- **The browser squares and re-encodes before upload** (canvas, 400px, JPEG 0.85).
  A 600×900 PNG test file arrived as a 5.5 KB JPEG. This keeps every avatar the same
  shape and weight, and avoids both the bucket ceiling and the Next server-action
  body limit — so no `bodySizeLimit` config was needed.
- The path is stable, so `avatar_url` carries a `?v=<timestamp>` stamp; without it
  browsers keep showing the previous picture.
- `saveAvatar()` takes **no path**. The server derives the location from the session,
  so a caller cannot point their avatar at someone else's file.
- `next.config.mjs` gained `images.remotePatterns` for `*.supabase.co` storage —
  wildcarded because staging and prod have different hostnames.

**Testing (staging)** — 15 browser/API checks: upload saves `avatar_url` with the
cache stamp, the file lands in the owner's folder as a small JPEG, it is publicly
readable, it renders in the header, inbox, conversation bubble and admin table,
another user cannot write into the folder, and removing it clears both the column
and the stored object and falls back to initials. T34 still 15/15, fatigue checks
pass, `next build`/`lint`/`tsc` clean. Staging swept — 0 users, 0 avatar objects.

**Limits worth knowing**
- One picture per person at a fixed path; no crop/zoom control (it centre-crops),
  no gallery or history.
- Deleting an account does not delete its avatar object. The storage policy lets
  admins delete avatars, but nothing calls it — the file is orphaned in the bucket.
  Worth a sweep later; it is a few KB per departed account.
- Animated GIFs are accepted by the bucket but the canvas step flattens them to a
  still JPEG.
- Avatars are not shown on the student's own thread list (only the staff inbox),
  since a student already knows who they are writing to.

### Shipped to prod, 2026-09-19

`20260919050000` applied to `cdvubijjepwmhhkgppbl`; prod history is 21/21 with no
drift and `db push --dry-run` reports "up to date". Vercel deployed `4101832`.
Smoke-tested on prod with two temporary accounts: the owner can upload into their
own folder, a second signed-in user is refused (400), the avatar is publicly
readable, and the bucket rejects a 3 MB file. Both accounts and all objects
removed — prod is back to 1 profile and 0 avatar objects.

## Event calendar (Claude, 2026-09-19) — LIVE ON PROD

A month calendar on `/study/profile`, which every role can reach, so it is "visible
on all profiles". Students add private entries; staff publish to a chosen audience.

**Where it appears**
- `/study/profile` → "Calendar": month grid with prev/next, a dot per event, and the
  selected day's events beside it with add/edit/remove.
- Code: `supabase/migrations/20260919060000_calendar_events.sql`,
  `src/lib/calendar/`, `src/components/calendar/`.

**Audiences**
`self` (private), `everyone`, `students`, `teachers`, `selected` (named students,
chosen from the roster). Students only ever get `self` — the selector isn't rendered
for them, the insert policy rejects anything else, and a trigger independently
refuses a non-`self` audience from a non-staff author.

**The visibility call worth knowing:** a student's `self` entry is invisible to
**staff too**, not just other students. "Students can make entries only on their
profile" reads as personal, so this is not a diary teachers browse. Verified: an
admin reading that row directly gets 0 rows. If you would rather staff see student
entries, that is a one-line policy change — but it should be a deliberate one.

**Schema notes**
- `event_date DATE` plus optional `start_time`/`end_time TIME`, not `timestamptz`.
  An exam date is a wall-clock fact; storing it as an instant makes it shift for
  anyone reading from another timezone. Date keys are built from local parts, never
  `toISOString()`, for the same reason.
- CHECK constraints: end time cannot precede start, and an end time requires a start.
- `calendar_event_audience` holds the named recipients. The events SELECT policy
  consults it through a SECURITY DEFINER helper (`is_calendar_target`) so the two
  tables' policies don't reference each other.
- Editing rights mirror the RLS policy exactly (`canEdit` in the query layer): your
  own entries, plus any published entry if you are staff. A student's private entry
  is never editable by anyone else.

**Testing (staging)** — 24 browser/API checks: the calendar renders for every role;
a student's form has no audience choice and their entry is labelled "Just me" with
readable times; staff get all five audiences; an `everyone` event reaches both
students; a `selected` event reaches only the named student and names them; a second
student sees neither the targeted event nor anyone's private entry; and at the API a
student cannot publish to everyone, cannot create an entry as someone else, cannot
delete another student's entry, and cannot promote their own entry to `everyone`
(403 on each). T34 still 15/15, fatigue checks pass, build/lint/tsc clean. Staging
swept to 0 rows.

**Limits worth knowing**
- Staff events show "Set by teaching staff" rather than the author's name to a
  student, because a student can only read a staff name along a shared conversation
  (the `20260919020000` rule). The fallback reads fine; showing real names here would
  mean widening that policy.
- Single-day events only — no multi-day spans, no repeats, no reminders, and no
  notification when an event is published (it simply appears).
- The `teachers` audience is included for completeness but staff already see every
  published event, so today it behaves as "hide from students".
- Month navigation is a full page load; only day selection is client-side.
- No timezone handling beyond storing wall-clock dates, which is deliberate.

### Shipped to prod, 2026-09-19

`20260919060000` applied to `cdvubijjepwmhhkgppbl`; prod history is 23/23 with no
drift and `db push --dry-run` reports "up to date". Vercel deployed `c1a02fd`.
Smoke-tested on prod with a temporary teacher and two students (7 checks): a student
creates a private entry but is refused when publishing to everyone (403); staff
publish successfully; a second student sees only the published event; staff cannot
read the private entry; and a `selected` event reaches the named student and not the
other. All events and accounts removed — prod is back to 1 profile, 0 events.

## Levelling: XP, ranks, student submissions (Claude, 2026-09-20) — LIVE ON PROD

Students earn XP and climb a rank ladder. Mock exams and approved question
submissions are the big awards; practice is a small one.

**Ranks — Benner's stages.** Novice → Advanced Beginner → Competent → Proficient →
Expert, at 0 / 300 / 1,000 / 2,500 / 5,000 XP. Patricia Benner's "From Novice to
Expert" is the standard nursing competency progression, so the ladder speaks the
language students are already studying rather than inventing game tiers — and it is
exactly the range the brief asked for. Renaming them is a one-line change in
`src/lib/xp/ranks.ts`.

**Weights** (all in the migration, one place):
- Mock exam: `100 + score`, so a 72% paper pays 172. Biggest commitment, and doing
  well pays more.
- Approved question: flat **150** — the largest single award, and only on approval.
- Practice run: `min(25, questions answered)`, so a one-question session can't be
  farmed.

**Why a ledger, not a counter.** `xp_events` is append-only: it gives students the
"where did this come from" breakdown, lets the total be recomputed if weights ever
change, and a UNIQUE index on `(reason, source_id)` makes every award idempotent — a
question approved, un-approved and re-approved pays once (tested). There is **no
INSERT policy at all**; XP is only ever written by SECURITY DEFINER functions, so
nobody can grant themselves any.

**Student question submissions** (`/study/submit`)
- Stem, four options with one marked correct, reasoning, domain, optional level and
  difficulty. Students see their own submissions with status and any reviewer notes.
- The insert policy only permits a draft that is `review_status='pending'`,
  `is_active=false`, `is_ai_generated=false` and attributed to the author. A new
  `trg_protect_question_review` trigger independently stops a non-staff account
  touching `review_status`, `is_active`, `reviewed_by` or `created_by`.
- Submissions carry `source='student-submission'`, which is what the review queue
  keys off. `/teacher/review` gained a **Source** filter (AI + student / AI-generated
  / Student submissions) and an AI-or-Student badge per row; the detail page, the
  review action and the teacher dashboard counts all follow the same scope.
- Approval fires `trg_award_question_xp`, which pays the author. It fires on the
  transition only, so the 2,500-odd questions already at `approved` awarded nothing
  retroactively, and an AI question (no author) pays nobody.

**Practice tracking** — practice saved nothing at all before this. `practice_sessions`
now records length, correct count and domain via the `record_practice_session` RPC,
which the tutor runner calls once when a run finishes. The client reports its tally;
the server decides the XP and attributes the session to the caller, and refuses an
implausible length. This also finally gives data on how students actually study.

**Two real bugs caught by the end-to-end test, both fixed before prod:**
1. `can_manage_question()` let teachers manage their own questions and the AI bank
   but *not* a student submission, so Approve silently affected 0 rows and no XP was
   awarded. Fixed in `20260920020000` — a teacher may manage anything genuinely in
   review (own, AI, or authored by a non-staff account), while another teacher's
   question still stays with its author or an admin.
2. `submitReview` still required `is_ai_generated`, so it rejected student
   submissions with "Question not found." The page guard had been widened but the
   action hadn't.

**Testing (staging)** — 30 browser/API checks: rank card starts at Novice and lists
all five stages; a submission saves as pending/inactive with four options and awards
nothing; it appears in the queue badged "Student"; approval activates it and pays 150
to the author, attributed to the question, and paying once on re-approval; a practice
run records and pays 5; a 75% mock exam pays 175; the total and rank advance to
Advanced Beginner with all three sources named. Boundaries: a student cannot grant
themselves XP, read another's XP, submit a pre-approved live question, approve their
own question, insert a practice session directly, or inflate a session length (403/400
on each). T34 still 15/15; fatigue checks pass; build, lint and tsc clean.

**Repo hygiene, unrelated to this feature:** an untracked `OKComputer_NRG_Website/`
reference site had appeared beside the app (a sibling of the already-ignored
`_v62`). Because `tsconfig.json` includes `**/*.ts(x)`, its 239 type errors **failed
`next build`** — it would have broken Vercel the moment it was committed. Now
excluded in `tsconfig.json` and added to `.gitignore`. Nothing was deleted; the
tailwind tokens sampled from it are unaffected.

**Limits worth knowing**
- XP only flows from the three sources above. Flashcards and case studies still
  persist nothing, so they award nothing.
- Ranks are cosmetic — nothing is gated behind them, and there is no leaderboard.
- Submissions are single-answer MCQ with exactly four options; no SATA, no images,
  and a student cannot edit a submission after it has been decided.
- Nothing rate-limits submissions beyond approval being the reward, so a flood of
  weak drafts would land in Jade's queue. The Source filter keeps them separable.
- XP is never deducted, including when an approved question is later rejected.

### Shipped to prod, 2026-09-20

Both migrations applied to `cdvubijjepwmhhkgppbl`; prod history is 26/26 with no
drift and `db push --dry-run` reports "up to date". Vercel deployed `73d12b5`, and
`/study/submit` is live (redirects signed-out visitors to `/login`).

Smoke-tested on prod with a temporary teacher and student (9 checks): **no XP was
awarded retroactively** to the 2,500-odd already-approved questions (0 ledger rows);
a student submits a pending draft and earns nothing yet; a student cannot submit a
live pre-approved question (403); a teacher approves it and the author receives 150;
the practice RPC records and adds 10; and a student cannot grant themselves XP (403).
All temporary accounts, submissions and practice rows removed — prod is back to
1 profile, 0 XP rows, 0 practice rows, 0 student submissions.

## Review of `OKComputer_NRG_Website/` — Jade's prototype (Claude, 2026-09-20)

Reviewed the folder Ian dropped beside the app. It holds three things: a working
Vite/React prototype (`app/`), ~16 Word specs, and 15 topic-review decks. This is the
authoritative record of what is in there, since the folder is gitignored and will not
travel with the repo.

**Note on the specs:** `NRG_Complete_Template_Package_v2.docx` supersedes the 13
individual templates and *changes numbers*. Where they disagree, v2 wins.

### What the prototype contains (11 routed pages)

Real, working mechanics worth taking:
| Page | What it does | State |
|---|---|---|
| RankSystemPage + `rankSystemData.ts` | 25-level Benner ladder, per-topic Elo, readiness score, XP award table, rank-up config | **Formulas real; UI is mock data.** The best IP in the folder |
| MockExamPage | 40 mocks × 100 q / 150 min, week-gated release (Mon+Thu), flagging, question-jump grid, per-domain + per-taxonomy results, fatigue curve | Real logic over real data; persists to `localStorage` only |
| CaseStudyPage | 100 Caribbean case studies as phased simulations — progressive vitals/labs, per-phase decision, per-option explanation | Real logic, real content |
| QuestionBankPage → QuizSessionPage | Filter (50 topics × 7 domains × taxonomy × count) → shuffled runner, 90 s/question, option shuffle that re-keys the answer | Real; saves nothing |
| QuestionGenerationPage | "Author 1 question per 24 h to keep access" gate + a 6-criterion rubric | Gate real; **the AI grader is `Math.random()`** |
| StudyLobbyPage | Group rooms: waiting → 60%-ready auto-start → countdown → timed questions → deferred rationales | Phase machine real; **peers are `Math.random()`** |
| NursingKnowledgeBlock | Floating fact widget, ~36 facts, 30 s rotation, pause/dismiss | Real, self-contained |

Mockups with nothing behind them: **AnalyticsPage** (every figure a literal, the "AI
recommendations" are hand-written prose), **InstructorDashboardPage** (8 fake students,
invented class stats, dead Export button), **LoginPage** (`handleLogin` ignores the form
and navigates home), **HomePage** (fabricated testimonials; the RENR domain/taxonomy
blueprint copy is worth keeping). `Home.tsx` is Vite boilerplate. `TopicReviewsPage.tsx`
exists but is **not routed**. `store/useAppStore.ts` has clean daily-reset and streak
rules but is imported by **zero** pages.

### The question data (~11,400 items) — do not bulk-import

`app/src/data/` is 12 MB across 77 files. Roughly **9,300 items are genuinely new**,
RENR-tagged (domain + KC/AP/ASE) and rationale-complete. But there are real problems,
and an answer-key audit has to come first:
- **Broken answer keys.** `mockExamPoolBatch1–4` (4,000 q): ~91% of correct answers sit
  in the first two option slots, and ~30% have an empty rationale. `caribbeanProfessionalism1000`:
  84% at index 1. `renrBatch4`: 828/1,025 at index 0 or 1. These were pasted answer-first
  and never shuffled — the prototype only looks right because it shuffles at runtime.
- **Copyright.** All 18 `saunders_*` files carry the header
  `// Source: Saunders Q&A Review (paraphrased for RENR format)` (145 q).
  `gapFillingQuestions` (124 q) are verbatim classic NCLEX items with 100% empty
  rationales. **Both need a rewrite or legal sign-off before going anywhere near prod.**
- **Empty stubs.** `agentSwarmBatch1–4`, `medSurgQuestions`, `safetyQuestions`,
  `psychosocialQuestions`, `managementQuestions`, `maternalChildQuestions`,
  `clinicalJudgmentQuestions`, `cardiacMiHfQuestions` are all `= []`.
- **Shape differences** to handle on import: `correct` is a 0-based index in most
  families, a **letter** in the 30 `caribbean2000part*` files, and a per-option boolean
  in case studies; `nrg1000*` prefixes option text with `"A. "`; no `difficulty` and no
  SATA anywhere (all 4-option single-answer).
- **100 case studies / 800 phase questions** are valuable but need their own schema
  (vitals, labs, body systems, phases).

### What I implemented from it

1. **Rank ladder replaced with Jade's own** (`src/lib/xp/ranks.ts`). I had shipped a
   5-rank Benner ladder earlier the same day; his design is 25 levels, five per tier,
   0 → 32,500 XP, with per-level descriptions. Now taken verbatim from
   `app/src/data/rankSystemData.ts`, so the platform matches what he designed.
2. **XP awards re-based on his `XP_AWARDS`** (`20260920030000`): mock exam 250, +150 for
   clearing the 66% RENR pass mark; practice 100 for 25+ questions, 40 for 10+, else 10;
   approved question stays 150 (his `qgen75to89` tier). My earlier weights would have
   made a 32,500-XP ladder unclimbable. Verified 6/6 — 65% pays 250, 70% pays 400.
   *Deviation:* his mock award assumes exactly 100 questions; ours are any length, so the
   bonus is judged on percentage, not count.
3. **Study streak** (`20260920040000`) to his Analytics definition — consecutive days
   with ≥10 questions, computed on read from practice and mock sessions so there is no
   counter to drift. Shown on the rank card. Verified 8/8 including lapse, gap, and
   sub-threshold days.

Safe to re-base the weights because the XP ledger was empty in both environments.

**Shipped to prod 2026-09-20.** `20260920030000` and `20260920040000` applied to
`cdvubijjepwmhhkgppbl`; history 28/28, no drift, `db push --dry-run` reports "up to
date". Vercel deployed `de8fada`. Verified on prod: `study_streak()` returns 0 for the
one real account, and the ledger is still empty, so no totals were disturbed by the
re-base.

### What I could not do, and why

**Needs a decision from Ian or Jade first**
- **Rank naming conflict.** `NurseBrain_Programme_Brief.docx` says Bronze → Diamond;
  `rankSystemData.ts` says Benner. I followed Benner (the newer, more detailed file, and
  what the brief itself calls the framework). Worth confirming with Jade.
- **Free-tier limits contradict themselves.** v1: 50 questions/day, 1 mock/week.
  **v2: 10/day, no mock exams at all.** Pick one.
- **Subscription pricing is literally unwritten** — "$XX/month or $XXX/year". No code
  can be written against that.
- **Importing the prototype questions** — audit done 2026-09-20 (`docs/phase-1/PROTOTYPE_DATA_AUDIT.md`):
  4,728 rows ready in `proto-import-clean.csv` (offline-validated), blocked on Ian/Jade's
  go/no-go, plus a call on the 269 copyright-flagged items. The "~9,300" figure was an
  overcount — the mock pool is mostly duplicates of the banks.
- **"School/university (required for marketing database collection)"** is a privacy and
  consent decision, not just a column.

**Needs an external service**
- **LLM API + budget** — the Q-generation grader (currently `Math.random`), question
  generation, and the classification agents.
- **Payments** — gateway choice including "local Caribbean payment methods".
- **Realtime infra** — synchronised group study (90 s timer, lock-in, live anonymous
  percentage bars). Supabase Realtime could do it, but it is a build, not a setting.
- **Google Meet** — group debriefs, office hours, the post-mock live review of the top
  40% hardest questions.
- **SMS** — v2 wants 2FA for Premium/Instructor/Admin via email *or* SMS OTP. Email-only
  would avoid a provider.
- **Email** — still unconfigured. Already flagged: Supabase's built-in sender is capped
  at a few per hour.
- **Licensed content** — RENR Prep Guide, CARICOM curriculum, ICN/WHO/CDC guidelines,
  and the YouTube channels named by brand (Osmosis, Khan Academy Medicine, Ninja Nerd).

**Buildable, just not built yet** (ranked by how self-contained)
1. **Topic Elo** — his formula is complete (logistic expectation vs 1500, K = 10/20/30
   by difficulty, 7 competence bands, 20 topics). Blocked on data, not design: practice
   currently stores only per-session totals, so Elo could only be fed from mock exam
   responses until practice records per-answer rows.
2. **Analytics page for real** — every formula is specified (accuracy, improvement rate,
   stamina bands 0–29/30–59/60–100, recommendation triggers at <70% domain accuracy).
   Same blocker: needs per-answer practice data for the domain/taxonomy breakdown.
3. **Topic reviews** — 15 finished decks sit in `nrg_htn_review/` and
   `nrg_medical_surgical_reviews/` as structured YAML-ish `.pptd` plus clean
   `outline.md`. Needs a table and a reading page; his XP spec already awards 30 for
   reading one. Highest content-value-per-effort item left.
4. **Rank-up exams** — fully specified: 20 questions, pass 14 (66%), 12 weak-area + 8
   broad, minimums of 5/10 ASE, 7/12 weak, 4/8 broad. `nrg1000RankUpQuestions` (500 q)
   is the intended bank. Needs the import first.
5. **Nursing Knowledge Block** — self-contained widget plus a facts table.
6. **Cross-linking** — question → its topic review → 3 related questions; needs the
   topic reviews first.
7. **Case study simulator** — the phased-disclosure engine and the 100-case dataset.
8. **Mock exam regulator to v2 rules** — always 100 q / 150 min, domain match within 2%,
   taxonomy within 3%, stem-length ratio 2:1:1:1 per 5-question block, no back-navigation,
   2 × 5 min breaks with the clock running. Our mock engine exists but does not enforce
   these.

## Nursing Knowledge widget: 133 facts, bounce, review PDF (Claude, 2026-09-20)

The floating card on the home page had 4 hardcoded facts. It now carries **133**
(129 new), has a bounce animation, and there is a PDF for Jade to sign off.

- **Facts moved to `src/lib/knowledge/facts.ts`** — 15 categories: Vital Signs 10,
  Lab Values 17, Medication Safety 20, Prioritisation 10, Infection Control 11,
  Fluids & Electrolytes 8, Respiratory 6, Cardiac 5, Neuro 5, Maternal & Newborn 10,
  Paediatrics 5, Mental Health 7, **Caribbean Focus 8** (sickle cell, dengue,
  chikungunya, leptospirosis, regional hypertension and T2DM — drawn from the
  programme brief's stated disease focus), Mnemonics 5, Safety 6. No duplicate
  prompts; every answer fits the card.
- **Bounce**: `bounce-in` on mount (a 480 ms overshoot via
  `cubic-bezier(.34,1.56,.64,1)`) and `bounce-nudge` when the fact changes — the
  inner block is keyed on the index so React remounts it, which is what re-fires the
  hop. Both are `motion-safe:` only, so `prefers-reduced-motion` gets the content with
  no movement (verified). Keyframes live in `tailwind.config.ts`.
- Widget also gained a position counter, a Previous button, and an aria-label.
- **Review PDF**: `docs/phase-1/nursing-knowledge-facts-for-review.pdf` — 12 pages,
  grouped by category, with a tick box and a correction column per fact plus a
  sign-off block. Generated by `npx tsx scripts/knowledge-facts-pdf.ts`, which
  **imports the same facts module the app does**, so the PDF and the widget cannot
  disagree. Rendering uses headless Chrome rather than a new npm dependency.

**This content has NOT had a clinical sign-off.** That is the whole point of the PDF.
The facts were written to be standard, textbook-level and high-yield, in SI units
(mmol/L, g/L) to match Caribbean and UK laboratory reporting, but a registration-exam
audience deserves a nurse's eye on every line. The PDF says so on page 1 and treats
anything unticked as unapproved.

Testing: 18 browser checks — the widget renders, the bounce resolves to real
overshooting keyframes, the nudge re-fires on advance, flip/next/previous/close all
work, 25 consecutive facts render non-empty, and reduced motion disables the motion
while keeping the content.

**Limits:** facts are a code constant, not a table, so editing one is a deploy rather
than an admin action — worth moving if Jade wants to maintain them himself. Favourites
and "don't show this again" are not implemented, and the widget appears only on the
home page (`src/app/page.tsx`), not inside the study flow.

## Prototype question-data audit (Kimi, 2026-09-20) — done, import NOT executed

Full report: `docs/phase-1/PROTOTYPE_DATA_AUDIT.md`. Script: `scripts/audit-prototype-data.ts`
(deterministic, seed 42). Outputs: `scripts/data/proto-import-clean.csv` (4,728 rows),
`scripts/data/proto-quarantine.csv` (5,897 rows, reason column), `proto-audit-stats.json`.

**The headline answer to the answer-key question: the slot-0/1 skew is benign.** For every
family with rationales, the rationale cross-check supports the keyed option (AGREES =
4,728/4,728 verifiable). The skew is paste-order, not wrong keys; options are shuffled
and re-keyed on export (re-key verified letter-exact against source for all 1,516 clean
caribbean2000 rows, 0 mismatches). Hand-checking 25 of the 77 flagged DISAGREES found
~85–90% are false positives (enumeration rationales, NOT-questions, rebuttal-by-
restatement) — quarantine is a review pool, not a bin.

**The mock exam pool is a mirage.** `mockExamPoolBatch1–4` (4,000 items) is ~2,790
stem-identical copies of the seven real banks; only 1,202 stems are unique and nearly
all of those have empty rationales — unkey-auditable. The pool contributes zero clean
rows. The real verifiable unique content is **4,728 questions**, not ~9,300.

**Quarantined (not deleted):** 2,567 unverifiable (incl. the 1,202 unrationaled pool
items), 2,792 duplicate stems, 269 copyright-flagged (145 Saunders-derived, 124
verbatim NCLEX — Ian/Jade call: rewrite or drop), 168 caribbean2000 items with
`domain: "ASE"` (taxonomy pasted into domain; needs re-tagging), 24 mangled stems
(a find-replace ate "St." — "at a the hospital. Kitts"), 1 malformed.

**Validated offline only:** `migrate-questions.ts --offline` → 4,728 ok, 0 errors,
0 skipped, all 7 domains. No database touched; no import run — that's a separate
decision after Ian and Jade read the report.

## Prototype data audit — Kimi's pass, independently verified (2026-09-20)

Kimi ran the audit from `docs/phase-1/KIMI_DATA_AUDIT_BRIEF.md`. Deliverables:
`scripts/audit-prototype-data.ts`, `scripts/data/proto-import-clean.csv` (4,728 rows),
`scripts/data/proto-quarantine.csv` (5,897 rows with reasons), and
`docs/phase-1/PROTOTYPE_DATA_AUDIT.md`.

**Its verdict: the slot-0/1 answer-key skew was benign.** The keys were right; the
options had simply been pasted answer-first and never shuffled. Fixed at export with a
seeded shuffle and re-key.

**I verified this independently** — re-parsing the prototype from scratch and
re-deriving the expected answer, using none of the audit's own code. 4,659 of 4,728
rows (98.5%) re-derived, **0 key errors**. Full table and method appended to the audit
report. The two apparent mismatches were my own comparison failing to decode `\uXXXX`
escapes, not key errors.

**The "~9,300 importable" figure in my earlier review was wrong**, and the audit caught
why: `mockExamPoolBatch1–4` is largely re-packaged copies of the real banks — about
2,790 stem-identical duplicates, and its 1,202 unique stems are almost entirely
rationale-less, so they cannot be key-audited at all. Real importable content is
**4,728**. Recommendation accepted: drop the pool as a source and build mock sets from
the banks instead.

**Two findings my review added:**
1. **Fixed a latent bug in `migrate-questions.ts`** — `source_id` was not in its
   `FIELD_MAP` aliases, so a `source_id` column normalised to `sourceid`, matched
   nothing, and every row silently fell back to a `hash:` id. That would have destroyed
   provenance for a 4,728-row import. It never surfaced before because Jade's original
   100 questions were loaded as hand-written SQL, not through the script.
2. **Three rows carry stray CJK characters** (`maternal-child:6858`,
   `nrg-general:5416`, `nrg-rankup:6032`) — a generation artefact. Fix or quarantine
   before import.

Nothing has been imported. `migrate-questions.ts --offline` reproduces 4,728 ok /
0 errors / all 7 domains. Still waiting on Ian and Jade: the go/no-go to staging, the
copyright call on the 269 Saunders-derived and verbatim-NCLEX items, and whether to
work the review pools (77 key-mismatch candidates, ~1,365 weak rationales, 168
ASE-domain mis-tags, 24 mangled stems).

## Prototype bank imported to STAGING as review queue (Kimi, 2026-09-20) — 4,728 rows, nothing live

Ian gave the staging go (same day). Import executed as an unapproved review queue:
every row `is_ai_generated=true, is_active=false, review_status='pending',
source='prototype-import'`, tagged `Author: NRG prototype bank` (a third author tag,
distinct from "Author: Jade Nicome" = his 100 hand-written and "Author: AI-generated" =
the 2,000-bank). **Prod untouched; nothing is visible to students.** Jade approves
through `/teacher/review`; approval is what sets `is_active=true`.

**Pre-import fixes**
- The 3 CJK rows flagged above are fixed — intent unambiguous in all three, repaired in
  the audit script (`repairCjk` in `scripts/audit-prototype-data.ts`, so re-runs keep
  the fix): `not替代`→"not a substitute", `永久NPO`→"permanent NPO", `定向
  strategies`→"orientation strategies" (2 occurrences). Re-validated: 4,728 ok, 0 errors.
- `scripts/migrate-questions.ts` grew `--ai-generated`, `--inactive`, `--source <v>`
  flags (defaults unchanged — Jade's original path behaves identically). `--author`
  already existed.
- **Schema fix on staging (prod pending Ian):** the first import attempt failed wholesale
  (success=0 / error=4,728, wrote nothing) — `idx_q_source_id` is a *partial* unique
  index, which Postgres refuses as an `ON CONFLICT (source_id)` arbiter. Replaced with a
  plain unique index on staging (semantics unchanged: NULLs still distinct; 0 duplicate
  source_ids existed — Postgres verified during creation). Migration file:
  `supabase/migrations/20260920050000_source_id_unique_arbiter.sql` — **needs applying
  to prod before any future prod import**, or prod upserts fail the same way.

**Post-import verification (real counts via `scripts/verify-proto-import.ts`)**
- Questions: 2,516 → **7,244** (+4,728 exactly). Pre-existing 2,516 untouched.
- Flags: 0 violations among all 4,728. Live leak: `prototype-import AND is_active=true` = **0**.
- Options: 4,728 questions × 4 options (18,912 rows), exactly 1 correct each. 0 failures.
- Domains match CSV exactly (NP 1069, PC 1099, NLM 581, CDM 611, HPMW 457, COM 440,
  PD 471); cognitive KC/AP/ASE → knowledge/application/analysis 1640/2091/997, exact.
- 20-row seeded spot-check vs CSV (stem, keyed option text, explanation): 0 mismatches.
- Review queue: 4,728 pending+AI+prototype-import rows; 4,728 `Author: NRG prototype
  bank` tag links. They appear at /teacher/review under Source "AI-generated".
- `node scripts/e2e-rls-test.mjs`: **15/15 PASS** after the bulk insert.

**Topic-taxonomy findings (not fixed — Ian/Jade's call)**
- +726 topic rows (487 → 1,213), 719 with `cluster_id NULL`. Expected ~1,508 new rows,
  but topic creation dedupes by **slug without the domain** — same-named topics across
  domains share one row, and script-created topics get `domain_id NULL`. Also, the
  migration matches the full "Parent / Child" topic string against CLUSTER_ALIASES (our
  cluster column is empty), so only 81/4,728 rows matched any alias. Extending the alias
  table needs first-segment keying (or a filled cluster column) to do anything.
- Top unmatched first segments: nursing theorists 173, nursing profession 162, nursing
  research 151, nursing ethics 133, neonatal jaundice 96, trauma & environmental
  emergencies 89, cardiovascular disorders 84, oncology & hematologic disorders 82,
  GI & hepatobiliary 80, musculoskeletal 74, endocrine & metabolic 70, respiratory 68,
  renal & urinary 68, wound care & aseptic technique 64, fluid balance & I/O management
  63, pediatric infectious disease 62, delegation/assignment/supervision 62, pediatric
  GI & nutritional 60, substance abuse & withdrawal safety 59, family dynamics &
  counselling 59.

**Known caveats for the review queue**
- 495 of 4,728 explanations contain `(A)`–`(D)` letter references in SOURCE order; after
  the anti-bias shuffle those letters no longer match displayed order. Reviewers should
  rewrite or strip these on approval (or we batch-fix beforehand — needs a decision).
- The failed first run left 4,728 error rows in `migration_log`
  (run_id `2026-09-20T10-28-20-628Z`) — historical, harmless.

## Prototype bank imported to STAGING (Kimi, 2026-09-20) — verified, nothing live

4,728 audited prototype questions are in staging, in Jade's review queue. Import by
Kimi from `docs/phase-1/KIMI_STAGING_IMPORT_BRIEF.md`; I verified it against staging
directly. Full detail appended to `docs/phase-1/PROTOTYPE_DATA_AUDIT.md`.

**State:** 7,244 questions on staging (2,516 pre-existing + 4,728 new). Every imported
row is `is_active=false`, `review_status='pending'`, `is_ai_generated=true`,
`source='prototype-import'`, tagged `Author: NRG prototype bank` — a third tag,
distinct from Jade's 100 (`Author: Jade Nicome`) and the earlier generated bank.
**Nothing reached students**; approval through `/teacher/review` is what activates a
question. Prod untouched (2,460 questions, 0 prototype rows). T34 still 15/15.

**Schema change to carry forward.** The upsert failed wholesale on first attempt
(`success=0, error=4728`, nothing written) because `questions.source_id` had a
*partial* unique index, which Postgres will not accept as an `ON CONFLICT` arbiter
and PostgREST cannot express the predicate for. Replaced with a plain unique index in
`20260920050000_source_id_unique_arbiter.sql`. I probed this live: duplicate
source_ids are rejected, multiple NULLs still insert, so the semantics really are
unchanged. **Prod needs this migration before any prod import**, or it will fail the
same way. This supersedes the T30 note about writing
`ON CONFLICT (source_id) WHERE source_id IS NOT NULL` — that works in raw SQL but not
through the client library.

**Stale letter references: found, scoped, and FIXED.** Kimi flagged 495 explanations
carrying `(A)`–`(D)` references left in pre-shuffle order. The confident total is
**808 rows (17.1%)** once `option A` and `answer A` are counted too — my first pass
said 843, which over-counted by including `A)` and bare `A.`, and those are
overwhelmingly false positives ("fever >=38 C)", "C. difficile", "Plan B.").

Repaired by `scripts/fix-explanation-letters.ts`: **807 of 807 now verify exactly**
against the original rationale with the derived mapping applied. Staging and the CSV
are both updated. The mapping comes from matching option *text* between the prototype
source and the stored order — not from the shuffle seed — so it is self-verifying, and
the script is idempotent because it derives the target from the immutable source
rather than transforming stored text. Only unambiguous forms are rewritten; 35 rows
containing solely the unsafe forms are listed for a human. Detail in the audit report.

**Two topic-taxonomy gaps:** 719 of 1,213 staging topics now have `cluster_id` NULL
(new — prod has 0 such), so those topics are unreachable by clinical area; and
`topics.domain_id` is NULL for every topic in both environments (pre-existing — the
migration script has never set it, and topic de-duplication ignores the domain). Both
matter before mock exams are built from a domain/cluster blueprint.

Only 81 of 4,728 rows matched a `CLUSTER_ALIASES` entry, because the script matches
the whole "Parent / Child" topic string. Extending the alias list alone will not help;
it needs first-segment keying or a populated `cluster` column. The 20 commonest
unmatched first segments are listed in the audit report.

## Key-mismatch pool cleared + review venue set up (Claude, 2026-09-20) — staging only

Four asks from Ian. Items 2 and 4 are done, 1 is done and testable, 3 is a written
proposal awaiting Jade.

### 4. The 77 "key mismatch" review pool — all false positives

Read all 77 by hand. In every case the rationale **did** support the keyed option. The
audit's `DISAGREES` rule fires on rationales that *contrast*: they describe the correct
answer, then characterise the alternatives without using a negation word, so the
distractor description out-scores the keyed option by token overlap and a sound item
looks wrong.

Three changes to `scripts/audit-prototype-data.ts`, in the order that mattered:

1. **Per-question RNG.** The option shuffle ran off one global `mulberry32` stream
   consumed in iteration order, so adding a single row reshuffled every row after it.
   Naively promoting the 70 would have silently invalidated the option order already in
   staging *and* the 807 letter references repaired against it the day before. Each row
   is now seeded from its own `source_id` (`seedFrom` → FNV-1a ⊕ SEED), making the export
   a pure function of its input. **Verified:** removing 70 rows from the middle of the
   export changed 0 of the 4,798 surviving rows. Re-runs are byte-identical.
2. **A `COMPOUND_OPTION` guard.** "All of the above" / "Both A and B" carry no
   distinctive tokens, so the keyed option always scores ~0 against individually-worded
   distractors — the heuristic cannot speak to them at all. 7 of the 77 were exactly
   this. They also breach the client's own no-compound-options standard, so they now
   return `UNVERIFIABLE` and stay in human review rather than entering a clean import.
3. **`HAND_REVIEWED_KEY_OK`** — the remaining 70 ids, recorded in the script with the
   reasoning, so the judgement travels with the code and survives a re-run. An id is
   only there because a person read that question; the heuristic is unchanged for data
   nobody has read.

Also fixed the CJK repair, which ran words together (`andorientation`) because the
prototype's generator emitted the tokens flush against the preceding word
(`...observation, and定向 strategies`). The repair table moved to
**`scripts/lib/cjk.ts`** because `fix-explanation-letters.ts` has to apply the *same*
transform to match DB option text back to the prototype source — when the two disagreed
it silently skipped the row and left its letters wrong. Unknown CJK is now quarantined
instead of shipped; that surfaced one more token (`承诺不` → "promises not").

Re-imported and re-verified on staging:

- prototype rows **4,728 → 4,798**; all still `is_active=false` / `review_status=pending`
  / `is_ai_generated=true`; the 2,516 pre-existing rows and Jade's 100 live questions
  untouched; **prod untouched** (2,460 questions, 0 prototype rows).
- `audit`: `clean=4798 agrees=4798 disagrees=0 unverifiable=2574 anomalies=24`.
- Independent re-derivation from the prototype source (none of the audit's code):
  4,726 of 4,798 matched, **0 key errors**. The 2 flagged rows were verifier artefacts —
  one an undecoded `—`, one the CJK row above.
- Answer positions even: A 1,217 · B 1,192 · C 1,204 · D 1,185.
- Letter fixer: 766 rows rewritten (1,755 references), then **idempotent** — a second
  pass plans 0 and reports 826 already correct.
- Explanation diff DB vs CSV across all 4,798: 4,032 identical, 766 differing **only**
  in option letters, **0 differing in any other text**.
- RLS e2e (T34) still 15/15. `next build` clean.

### 2. Copyright material — confirmed never committed

`docs/phase-1/COPYRIGHT_REVIEW_LIST.md` + `scripts/list-copyright-items.ts` list 269
held-back items (145 Saunders-derived across 18 files, 124 verbatim NCLEX with 0
rationales) as **identifiers only** — id, domain, taxonomy, topic. No stem, option or
rationale is written to a tracked file, because the text is the thing under review and
Git history is hard to purge. `scripts/data/` is gitignored; verified 0 of 269 stems and
0 rationales appear in the tracked doc. Recommendation in the doc: **drop rather than
rewrite** — ~5% more questions against real legal exposure, and a rewrite deep enough to
clear the derivative-work problem is just writing new questions.

### 1. Where to review the staging bank

**Resolved 2026-09-20 — live at https://nrg-platform-staging.vercel.app**

My first answer was "push a branch and send Jade the preview URL". That was wrong, and
the correction is the useful part of this entry.

The Preview environment variables *do* point at staging (`kwhaqhhwqykckarjbdod`) — that
part was right. But **preview URLs are gated and Jade could never have opened one.** The
project uses Vercel's Standard Protection
(`ssoProtection.deploymentType = "all_except_custom_domains"`). Verified directly: a
per-deployment URL returns `302` to `https://vercel.com/sso-api?...`, while the
production alias returns `200`. Every preview URL *is* a per-deployment URL. The account
is on the **Hobby** plan, which has no team members, so Jade could not have been invited
to view a protected deployment either.

### What was built instead — a second Vercel project

`nrg-platform-staging` (`prj_polFw0WdQaEOST34t8oRvMCQXII1`), same GitHub repo, its own
environment variables pointing at the staging Supabase project. Because
`https://nrg-platform-staging.vercel.app` is that project's *production* alias, it is
exempt from the SSO gate and publicly reachable.

One deviation from the plan, for the better: **its production branch is `main`, not a
separate `staging` branch.** Vercel's API refuses to set the production branch (it is a
dashboard-only field — `PATCH /v9/projects/{id}` rejects `productionBranch`,
`gitRepository` and `link` as unknown properties, and `POST /v9/projects/{id}/link`
silently keeps `main`). Tracking `main` turns out to be what we actually want: the
staging site always runs current code against staging data, with no branch to keep in
sync and no drift. A `staging` branch was created and then deleted, since with
`productionBranch=main` it would only have produced gated preview deployments.

So there are now two sites off one repo, and a push to `main` updates both:

| Site | Database | Public? |
|---|---|---|
| `nrg-platform.vercel.app` | prod `cdvubijjepwmhhkgppbl` | yes |
| `nrg-platform-staging.vercel.app` | staging `kwhaqhhwqykckarjbdod` | yes |

Confirmed black-box in a real browser rather than by reading credentials: the prod site
contacts only the prod Supabase host, the staging site only the staging host. The
env-var write had a hard assertion that refused to proceed if any prod project ref
appeared in the values being written to the staging project. Prod's own variables were
not touched.

**Jade's access:** `https://nrg-platform-staging.vercel.app`, account
`jade@nrg-staging.test` (role `teacher`), password handed to Ian separately. Then
`/teacher/review` → Source → "Prototype bank (imported)".

Verified on the live site, signed in as Jade — **7/7**: no Vercel login wall, sign-in,
prototype bank 4,798 (which is itself the proof it is hitting staging, since prod has 0
prototype rows), Jade's AI batch separately at 2,416, the clinical-area filter, the
detail page's approve/reject actions, and a real Area shown instead of a dash. Network
capture confirms prod was never contacted. Separately smoke-tested 7 more pages
(`/teacher`, `/teacher/messages`, `/teacher/mock-exams`, `/study`, `/study/profile`,
`/study/practice`) — all 200, no uncaught page errors.

**Worth knowing:** the staging URL is public and signup is open, so anyone with the link
can register as a student there. That is the same exposure prod already has, and staging
has only 100 live questions (Jade's own) — the 4,798 imported ones are all
`is_active=false`, so a signed-up stranger cannot see them. Password Protection would
close this but is Pro-only.

### Two fixes that were needed regardless of venue

- **Staging had zero accounts**, so nobody could log in (the T34 e2e test cleans up after
  itself). Jade now has a `teacher` account there. Prod still has only Ian's
  `super_admin`.
- **The review queue could not separate the two banks.** Both Jade's AI batch and the
  imported prototype bank are `is_ai_generated=true`, so the source filter's `ai` option
  showed one undifferentiated list of 7,214 pending items — 289 pages. Added a
  **`prototype`** source filter (`src/lib/review/filters.ts`) and a "Prototype" row
  badge. The partition is exact: ai 2,416 + prototype 4,798 = 7,214, no overlap, nothing
  lost. `ai` uses `or(source.is.null,source.neq.prototype-import)` rather than a bare
  `.neq()`, because SQL's `NULL <> 'x'` is NULL and would have hidden any AI row whose
  source was never set.

Spot-checked the letter fix in the real UI: `proto:nrg-rankup:5916` had "Salbutamol (A)"
when Salbutamol is option D; it now reads "Salbutamol (D)", and every letter reference
names the drug actually in that slot.

### 3. The 726 cluster-less topics — APPLIED to staging

Ian said to go ahead, so the mapping is applied on staging. Proposal and reasoning:
`docs/phase-1/TOPIC_CLUSTER_PROPOSAL.md`, generated by
`scripts/propose-topic-clusters.ts` (read-only unless `--apply`, and it refuses to run
against prod).

The number was **726** topics, not 719, holding **4,630 of 7,314** questions — so
anything targeting study by clinical area could not see 63% of the bank, and the review
screen showed their Area as "—".

The approach: **101 decisions, not 726.** Prototype topics are named
`Clinical area / Sub-topic` and the 726 share only 101 distinct first segments, so
mapping a segment assigns every topic beneath it. All 101 fit the five clusters that
already existed, so there was no schema change and no second taxonomy.

Applied and verified on staging:

- exactly **726** topics changed; **0** topics that already had a cluster were touched;
  **0** still NULL; every topic name unchanged.
- **0** questions now sit on a topic with no clinical area, down from 4,630.
- whole-bank spread: med-surg 2,487 · maternal-child 2,033 · management/professional
  1,409 · safety/procedures 908 · psychosocial 477 (7,314 total).
- the prototype bank alone: 1,612 · 1,555 · 1,008 · 413 · 210, summing to exactly 4,798.
- **prod untouched** (479 topics, 0 NULL clusters); no prototype row is live.
- Playwright against staging: the Clinical area filter now reaches the whole prototype
  bank, and the detail page shows a real Area ("Maternal-child and family nursing")
  instead of a dash. Area and domain filters combine (402 rows for cluster 1 + NP).

Rollback if Jade disagrees wholesale: set `cluster_id = NULL` for the 726 ids captured
before the change. Correcting individual segments is better done by editing `RULES` in
the script and re-running `--apply`.

Two deliberate non-decisions, both explained in the doc:

- **Did not collapse the topics.** 349 hold a single question and it looks like sprawl,
  but I tested the hypothesis that the sub-topic half just restates the RENR domain — it
  does not. Only 53 of 726 (7%) do; the other 673 name a genuine clinical sub-topic.
  Collapsing would discard teaching detail to fix a different problem.
- **Did not add clusters.** Every segment had an obvious home in the existing five.

The mapping still wants Jade's nursing eye — the doc flags the arguable calls rather
than presenting them as settled (gynae-oncology in med-surg; `Dengue` vs
`Dengue in Children` split by age group; substance abuse under psychosocial).

Separate issues found while measuring, each needing its own decision: two naming
conventions now coexist in `topics` (curated `Cardiac` vs imported
`Cardiovascular Disorders / Heart Failure`); 56 topics are bare abbreviations (`COPD`,
`CAP`, `T2DM`, `CKD`, `TB`, `BPH`, `RDS`, `IHD & ACS`) that would display to students
as-is; near-duplicates at different granularity; and **every topic in both environments
has `domain_id` NULL** (pre-existing — the migrate script never sets it).

## Group exams + an exam timer (Claude, 2026-09-20) — LIVE ON PROD

> The heading originally read "staging only"; the prod apply and deploy are recorded in
> "Deployed to prod, 2026-09-20" at the end of this section. Heading corrected 2026-09-24.

Ian asked for "a group test option where students can do a test as part of a group, up
to 5". Four design questions went back first; his answers: the **group challenge**
model, groups formable by **both students (join code) and teachers (named students)**,
teachers can **see group results**, and **yes to an optional time limit**.

### Why this model and not a shared answer sheet

A group of five could have sat one paper and produced one score. That was rejected on
product grounds, not technical ones. Everything downstream of `mock_exam_sessions` —
XP, rank, the study streak, the fatigue report, every teacher analytic — depends on a
score meaning *this student knows this*. With a shared sheet one strong member carries
four others and a rank stops meaning "ready for RENR", which is the one thing the
platform exists to tell someone. The challenge model keeps the social pull (sit it
together, see how you placed) while every member still produces their own ordinary
session row, so **nothing downstream needed changing**.

Genuine collaboration still has teaching value and is worth adding later as an
explicitly non-assessed practice mode — flat participation XP, excluded from readiness
and fatigue. It should not be the thing that counts.

### Migration `20260920060000_group_exams_and_timer.sql`

- `exam_groups` (set, creator, 6-character join code, `max_members` 2–5, status
  lobby → running → finished/cancelled, shared `expires_at`) and `exam_group_members`
  (one row per student, pointing at their own session).
- `mock_exam_sessions` gains nullable `group_id` and `expires_at`; `mock_exam_sets`
  gains `duration_minutes` (5–600, NULL = untimed). Nullable throughout, so solo
  attempts are untouched and nothing needed backfilling.
- Every write is a SECURITY DEFINER RPC (`create_exam_group`, `join_exam_group`,
  `assign_exam_group`, `start_exam_group`, `leave_exam_group`), and neither new table
  has an INSERT/UPDATE policy. The rules cannot be bypassed from a client.

Four things that were easy to get wrong, and what was done about each:

1. **"Up to 5" is not a CHECK constraint.** A check cannot count sibling rows, and the
   obvious trigger is racy — two students joining a 4-member group both count 4, both
   pass, and the group ends up with 6. `enforce_exam_group_capacity` takes
   `SELECT ... FOR UPDATE` on the group row first so concurrent joins serialise.
   Tested with two simultaneous joins on a 2-seat group: one succeeded, final
   membership 2.
2. **The deadline has to be server-side.** The countdown in the browser is a courtesy;
   the enforcement is `session_accepts_answers()`, which the two
   `mock_exam_responses` policies now call. Past the deadline, both INSERT and UPDATE
   are refused — so a tampered or merely wrong client clock buys nothing. Verified:
   403 on a new answer and on editing an existing one.
3. **A closed laptop must not leave a session open forever.**
   `complete_expired_exam_sessions()` settles and scores anything past its deadline,
   and runs lazily whenever a session, group or teacher page is read.
   `complete_mock_exam_session` was replaced to allow one extra case — anyone may close
   an attempt *whose deadline has already passed*, since the score is determined by
   then. Before the deadline it is still the student or an admin only, so a teacher
   cannot force-submit a live exam. Both directions tested.
4. **Staggered finishing leaks answers.** Found by looking at a real screenshot rather
   than by reasoning: the results page names the correct option for every question, so
   in a group the first person to hand in can read the answers out to the people still
   sitting. Solo, this never mattered. The question review is now withheld while any
   group-mate is still going — score and standings show immediately, the per-question
   review opens when the last member submits.

XP is unchanged and needed no new rules: each member's own session pays through the
existing `complete_mock_exam_session`, and `xp_events`' unique `(reason, source_id)`
index means a timed-out attempt still pays exactly once. No group-completion bonus was
added — five friends could spin up groups to farm it.

### App

Student: a group panel on `/study/mock-exams` (join by code, plus any live group of
theirs), "Sit it with a group" on each set card, a lobby at
`/study/mock-exams/group/[groupId]` showing the code and who has joined, and shared
standings on the results page. The lobby **polls every 3 seconds** rather than using
Supabase Realtime — five people looking at a screen for a minute does not justify a
websocket dependency and a second authorization surface. That is also what pulls the
other members into the exam when the owner starts.

Teacher: a panel on the set page to set/clear the time limit, build a group from named
students (2–5, checkbox roster), start it, and watch each group's scores. Set creation
takes a time limit too.

`mock_exam_responses` stays own-or-staff, so the standings show scores and never
answers — confirmed by a group-mate reading 0 rows of someone else's responses.

### Verification

- **27 database assertions** across three API-level suites: capacity, the join race,
  the one-live-group-per-paper rule, staff exclusion, start permissions, the shared
  deadline, answer refusal after expiry, scoring, XP paid once, group-mate visibility
  (scores yes, answers no, outsiders nothing), profile names in the lobby, and the
  group closing when the last member submits.
- **18 UI assertions** with three real students in three browsers: create, join by
  code, the roster filling, non-owners having no Start button, the owner starting,
  everyone getting their own session, the countdown, and a member being pulled in by
  the poll.
- **6 more** on answering and the review gate: answers recorded, a real score, review
  withheld while a classmate is still sitting, then opening once they hand in.
- **11 more** on the teacher flow: time limit, assigning a group, starting it, results,
  and the student being taken into their attempt.
- `next build` and `tsc --noEmit` clean. `src/lib/supabase/types.ts` extended by hand
  for the new tables and RPCs (`supabase gen types` needs Docker, which this machine
  does not have — the file already said so).

Staging was returned to a clean state afterwards: test users, groups and sets removed,
7,314 questions and exactly 100 live (Jade's own). One thing to own: an earlier
Playwright run had **approved an AI question** through Jade's staging account, leaving
it live. That was found while auditing the cleanup, and reverted to
`pending` / `is_active=false`; approved-AI is back to 0.

### Deployed to prod, 2026-09-20

`20260920050000` and `20260920060000` applied to prod, then `main` pushed — which
deploys both Vercel projects.

Pre-flight on prod before touching it, all read-only: 2,460 questions, 460 live, 1
profile, no exam sessions, `exam_groups` absent (404), and — the one that mattered —
**0 duplicate `source_id` values**, since `20260920050000` rebuilds that index as a
plain unique index and would have aborted the transaction on a duplicate. Then a dry
run alone, read, and only then the apply.

The first two apply attempts were refused by the permission classifier as a production
deploy: the existing Bash rule matched the *direct* host, while CLAUDE.md now routes
through the pooler, so the pattern no longer matched. Ian added a pooler rule. A
consolidated paste-ready SQL file was prepared as a fallback and was not needed; if it
is ever wanted again the generator is in the session scratchpad, and the important
detail is that it also inserts the `supabase_migrations.schema_migrations` rows —
without those a later `db push` re-runs the migration, which is exactly the desync that
happened on staging when `20260920050000` was applied by hand.

Verified on prod after applying:

- `exam_groups`, `exam_group_members`, `mock_exam_sets.duration_minutes`,
  `mock_exam_sessions.group_id/expires_at` all present;
  `complete_expired_exam_sessions` callable.
- Nothing pre-existing moved: still 2,460 questions, 460 live, 1 profile, 0 prototype
  rows, 0 groups. Migration history 28 of 28, nothing pending.
- The replaced policies are right, checked in `pg_policies` rather than assumed —
  **exactly one** `profiles` SELECT policy (not a duplicate left behind), carrying all
  five clauses including the new `shares_exam_group_with`; the four
  `mock_exam_responses` policies; and the group-aware
  `mock_exam_sessions: own, group-mate, or teacher+ read`.
- `idx_q_source_id` is now `CREATE UNIQUE INDEX ... (source_id)` — plain, not partial,
  so it can finally act as an `ON CONFLICT` arbiter. **This unblocks a prod import of
  the prototype bank**, which is now a content decision rather than a schema one.

Post-deploy: both projects READY on `5ddba0c`. Prod `/`, `/login`, `/signup` all 200
with no 5xx, and `/study/mock-exams` and `/teacher/mock-exams` redirect cleanly rather
than erroring for a signed-out visitor. On staging, signed in as Jade: the teacher
mock-exam page renders and the review queue still reports 4,798 prototype questions.

Group exams were not re-exercised end to end against prod, deliberately — prod has no
student accounts, and creating throwaway students there to prove a feature already
proven by 62 assertions on an identical schema is not worth writing to the production
database. The staging site runs the same commit.

## Provenance fix: Jade's questions were flagged as AI (Claude, 2026-09-20) — LIVE ON PROD

Ian asked whether prod's 2,000 AI questions were the same as staging's, and whether
they could be kept out of prod until Jade reviews them.

**They are identical, and they were already held back in prod** — 2,000 `ai:*` rows in
each environment, same `source_id`s, all `review_status='pending'` and
`is_active=false` in both. They have never been visible to students. Duplication is
also structurally impossible now: `source_id` carries a plain unique index in both
environments (`20260920050000`) and the migrate script upserts on it, so re-importing
a file updates in place. 0 duplicate `source_id`s on prod.

**The real problem was next to them.** Prod was serving 460 live questions against
staging's 100. The 360-question gap was seven `jade:*` batches — `nrg-new-100`,
`nrg-renr-100-original`, `nrg-soft-launch-mock`, `nrg-mock-paper-1`/`-2`,
`nrg-restart-master-15`, `nrg-new-set-5` — flagged `is_ai_generated=true`, carrying
**no author tag**, and marked `review_status='approved'` with **`reviewed_by=NULL`**.
Nobody had approved them; the flag was set so the rows could satisfy
`questions_ai_active_requires_approval` and go live. Only `jade:nrg-sample-1` (100)
had been imported correctly.

So the concern about unreviewed content reaching students was well founded — it was
just pointing at the wrong 2,000. Ian confirmed the 360 are Jade's own writing, so the
AI flag was wrong on import.

`20260920070000_correct_jade_provenance.sql`, applied to staging then prod:

- `is_ai_generated -> false` and `review_status -> 'approved'` for every `jade:%` row
  that was flagged AI, matching both `nrg-sample-1` and the convention
  `20260919010000` already applied to human-authored questions.
- **`is_active` deliberately untouched** — prod's stay live, staging's stay inactive.
  Ian's call: staging is a sandbox, not a mirror, so the 460-vs-100 difference stands.
- The `Author: Jade Nicome` tag applied to all of them, so everything Jade wrote is
  discoverable the same way regardless of which file it arrived in.
- New CHECK `questions_approval_needs_a_reviewer`: an AI question cannot be
  `approved` with `reviewed_by IS NULL`. The older constraint stopped an *unapproved*
  AI question going live; it did nothing about a bulk UPDATE writing 'approved' with
  nobody accountable, which is exactly how this happened. `submitReview` always writes
  `reviewed_by`, so the real review path is unaffected — verified both directions.

Scoped to the `jade:` prefix, so it could not touch the `ai:` bank or the `proto:`
import.

Verified after each apply. Staging: 0 of Jade's flagged AI, live still 100, all 516
tagged, AI review queue now exactly the two machine banks (6,798 = 2,000 + 4,798).
Prod: still 2,460 questions and **still 460 live, so students saw no change**, 0
flagged AI among Jade's, all 460 tagged, the AI bank untouched at 2,000 pending and
none live. The guard was then tested live in both: approving an AI question with no
reviewer is rejected (23514) and leaves the row untouched; a named reviewer still
succeeds.

Side effect that is the point rather than a cost: Jade's own questions have left the
AI review queue. He should not be reviewing his own writing as though a machine wrote
it. Proofreading his transcriptions is the separate T33 task.

## Doc reconciliation against the live databases (Claude, 2026-09-24)

No code or schema changed. This log and `PLAN.md` had drifted from what is actually
deployed, in a way that would mislead a cold-start AI session or a hand-off to Kimi —
four sections still described work as staging-only or unbuilt that had shipped on
2026-09-20.

Checked rather than assumed: `supabase_migrations.schema_migrations` was read on both
projects via the Supabase connector. **Prod and staging each hold the same 29
migrations**, `20260916012340` through `20260920070000`, matching
`supabase/migrations/` file-for-file with nothing pending on either side. In
particular `20260919010000_question_review_workflow` — which `PLAN.md` still listed as
awaiting Ian's go-ahead — has been on prod since the 2026-09-20 `db push`, which
carried every then-pending migration, not just the group-exam pair named in that
session's notes. `git status` is clean and `main` is level with `origin/main`, so the
deployed build includes `/teacher/review`.

Corrected here: the question-review, fatigue-analysis and group-exam headings (all now
LIVE ON PROD, each with a dated note saying what the old wording claimed); the
"how to access questions to review" section, which told the reader the review UI was
not on prod; the Git section, which listed two long-since-pushed commits as local; and
the frontend bullet under "not yet done", which claimed the `/study`, `/teacher` and
`/admin` UIs were largely unbuilt — 24 pages exist under `src/app/`.

That bullet list is now what it says it is: only genuinely open items, each with an
owner. Everything left on it is a content, policy or client-communication call for Ian
or Jade, plus three mechanical AI chores (T16 email templates, the RLS grant revoke,
`topics.domain_id`).

**Worth noticing for next time:** the drift was one-directional — work got done and the
doc kept saying it hadn't. Three of the four wrong headings were written in the same
session that later did the prod deploy and recorded it *inside* the same section
without touching the heading. Writing the deploy note at the bottom of a section is not
enough; the heading is what a skimming reader and a fresh AI session both read.

## Not yet done / not yet verified

- **T33 — human read-and-verify** of the 20 sampled questions against the docx
  (script above is ready; the judgment call is not done).
- **T35 — Notify client (Jade) that M2 is delivered.** Not done — this is Ian's call,
  not an AI task.
- **Three unreviewed files** in `Downloads/RENR/NRG RENR QUESTIONS/`:
  `NRG_100_New_Questions.docx`, `NRG_Rewritten_Sample_Questions_1_Questions_Only.docx`,
  `NRQ_Rewritten_Sample_Questions_1.docx`. Unknown whether these are new content or
  alternate drafts of the same 100 questions — flagged, not investigated.
- **Copyright call on 269 held-back questions** (145 Saunders-derived, 124 verbatim
  NCLEX). List at `docs/phase-1/COPYRIGHT_REVIEW_LIST.md`; recommendation is to drop
  rather than rewrite. Ian's call.
- **Policy decision: should students see inactive questions?** (T34 finding #1.) The
  `questions: authenticated read` policy has qual `true`. One-line change once decided.
- **Analytics / rank pages** — no backing tables exist for leaderboards or performance
  analytics. Needs Ian's data-model decision before anyone builds.
- **Prod import of the prototype bank** (4,798 rows, live on staging's review queue).
  Schema has been ready since `20260920050000`; this is now purely a content decision.
- **Jade's clinical review** of the 4,798 prototype questions, the 2,000 AI questions,
  the 133 nursing-knowledge facts, and the staging topic-cluster mapping.

The frontend build-out is **no longer outstanding** — this bullet previously claimed the
`/study`, `/teacher`, `/admin` and `/super-admin` UIs were "largely unbuilt", which was
already false when written. Verified 2026-09-24: 24 pages exist under `src/app/`,
covering practice, flashcards, case studies, mock exams (solo + group), submissions,
profile, messaging, the review queue, and all three dashboards.

## How to access questions to review

**The in-app review UI is now the normal route** — `/teacher/review` is live on prod and
on staging, so raw SQL is only a fallback for bulk browsing or for questions the UI does
not surface. For Jade's review of the imported prototype bank, use the staging site
(https://nrg-platform-staging.vercel.app → `/teacher/review` → Source → "Prototype bank
(imported)"), not prod.

The SQL below is read-only browsing and safe to run on either project. Note that manually
setting `is_active = true` now also requires `review_status = 'approved'`, and — since
`20260920070000` — an AI question additionally requires a non-NULL `reviewed_by`.

**Option A — Supabase Studio (no code):**
- Prod: `https://supabase.com/dashboard/project/cdvubijjepwmhhkgppbl/editor`
- Staging: `https://supabase.com/dashboard/project/kwhaqhhwqykckarjbdod/editor`
- Open the `questions` table, use the filter bar (`is_active` / `is_ai_generated` /
  `source_id`), and click a row to see it. Filter to `question_options` by
  `question_id` for the answer choices, since options live in a separate table.

**Option B — SQL Editor** (same project URLs, `/sql/new` instead of `/editor`) —
faster once you're doing more than a handful:

```sql
-- Jade's 100 real questions (T33 QA), with their options
select q.source_id, q.body, q.explanation, q.cognitive_level,
       array_agg(qo.body order by qo.display_order) as options,
       array_agg(qo.is_correct order by qo.display_order) as correct_flags
from public.questions q
join public.question_options qo on qo.question_id = q.id
where q.source_id like 'jade:nrg-sample-1:%'
group by q.id
order by q.source_id;

-- AI-generated bank awaiting review (2,000 rows, is_active=false)
select q.id, q.domain_id, q.topic_id, q.body, q.cognitive_level, q.difficulty
from public.questions q
where q.is_ai_generated = true and q.is_active = false
order by q.created_at
limit 50;   -- page through with offset, or filter by domain_id/topic_id
```

**To activate a question after review** (once you're satisfied — no UI yet, so this
is manual): `update public.questions set is_active = true where id = '<uuid>';`

**Option C — export to a spreadsheet** for offline review (e.g. sending a batch to
Jade for content sign-off) — say the word and I'll pull a batch into an .xlsx.

## Repo pointers

- `README.md` — commands for local dev, migrations, question generation, content
  migration.
- `docs/environments.md` — Supabase project refs, keys location (never in git).
- `docs/phase-1/` — audit, field mapping, edge cases, validation report,
  item-writing rules used to constrain AI-generated question quality.
- `supabase/migrations/` — source of truth for schema, applied via Supabase MCP
  (see README for the `db push` reconciliation note).
- `scripts/migrate-questions.ts` — client content migration (CSV → DB).
- `scripts/generate-questions.ts` — AI question generation, provider-agnostic
  (anthropic / openai / ollama / any OpenAI-compatible endpoint / mock).

## Git

`main` is clean and level with `origin/main` (verified 2026-09-24, `HEAD` = `490380b`,
"fix(data): correct the provenance of Jade's questions, and require a named reviewer").
The earlier note here — that `f1d4d95` and `6927c9e` were unpushed — was stale; both
shipped in the 2026-09-20 push.

A push to `main` deploys **both** Vercel projects: `nrg-platform` (prod DB) and
`nrg-platform-staging` (staging DB). There is no separate staging branch.
