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
the only `is_active=true` rows — 100/2,100 total). **A review UI now exists on
staging** (`/teacher/review`, see below) but is not yet on prod; until it is, use "How to
access questions to review" below.

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
- Committed as `f1d4d95` (local, not pushed).

## Question review section (Claude, 2026-09-19): built + tested on staging, NOT yet on prod

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
  `/teacher/review`. Committed as `6927c9e` (local, not pushed).

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

## Fatigue analysis (Claude, 2026-09-19) — built, tested on staging, NOT yet on prod

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

## Not yet done / not yet verified

- **T33 — human read-and-verify** of the 20 sampled questions against the docx
  (script above is ready; the judgment call is not done).
- **T35 — Notify client (Jade) that M2 is delivered.** Not done — this is Ian's call,
  not an AI task.
- **Three unreviewed files** in `Downloads/RENR/NRG RENR QUESTIONS/`:
  `NRG_100_New_Questions.docx`, `NRG_Rewritten_Sample_Questions_1_Questions_Only.docx`,
  `NRQ_Rewritten_Sample_Questions_1.docx`. Unknown whether these are new content or
  alternate drafts of the same 100 questions — flagged, not investigated.
- Frontend build-out for `/study`, `/teacher`, `/admin`, `/super-admin` — route
  guards and auth exist, and the teacher review queue is now built (see above), but the
  other page UIs (question practice flow, flashcards,
  case studies, mock exam UI) are
  largely unbuilt as of this log. Check `src/app/` directly for current state before
  assuming anything here is stale.

## How to access questions to review

The in-app review UI (`/teacher/review`) is built but not yet on prod, so until then review
happens directly against the database. Note: the manual `is_active` update below now also needs
`review_status = 'approved'` once the review migration is applied (the new CHECK constraint requires it). Both are read-only browsing — safe to do on
prod.

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

- `HEAD` at start of the 2026-09-19 session: `ba6d4eb`. Since then, local commits on `main` (not pushed to
  `origin/main`): `f1d4d95` (T33 QA script), `6927c9e` (review queue + migration + docs).
