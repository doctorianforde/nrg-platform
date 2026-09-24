# NRG Platform — Plan / Task Tracker

Companion to `PROGRESS.md` (what's done and why). This file is the task list and
hand-off map. Update status inline as tasks close; don't let this drift from
`PROGRESS.md` — if they disagree, `PROGRESS.md`'s narrative is the source of truth
for *what actually happened*, this file is for *what's left and who does it*.

## Status legend
`done` · `pending` · `needs-verify` (marked done before, not re-confirmed) · `blocked`

**Reconciled against the live databases 2026-09-24.** Prod and staging both hold the
same 29 migrations (`20260916012340` → `20260920070000`), matching
`supabase/migrations/` with nothing pending on either side; `main` is clean and level
with `origin/main`. Rows that claimed a prod migration or deploy was still pending have
been corrected — see the 2026-09-24 entry in `PROGRESS.md` for what was wrong and why.

---

## Phase 1 — you vs. AI, everything still open

Everything in Weeks 1–3 + Addendum (T01–T38) is done except the three rows marked
below. This table is the complete remaining Phase 1 punch list, split by who
actually needs to do it.

| Item | Owner | Why |
|---|---|---|
| T33 — Sample QA, 20 of Jade's real questions | **You** (script done, 2026-09-19: `node scripts/qa-sample.mjs --out qa.md`) | The *judgment call* — is this an accurate transcription of what Jade wrote — has to be a human who knows the content. AI/Kimi can write the script that pulls the 20 rows side-by-side with source; can't do the actual read-and-verify. |
| T34 — RLS end-to-end test | Done (Kimi) | — |
| T34 finding: should students see inactive questions? | **You** (decision only) | Product/policy call. Once decided, the policy fix itself is a one-line AI task. |
| T35 — Notify Jade that M2 is delivered | **You** | Client communication. Not an AI task under any circumstance here. |
| RLS hardening (revoke unneeded grants) | **AI** (Kimi) | Mechanical, well-specified, no judgment needed — optional hardening, do whenever. |
| Review the 2,000 AI-generated questions (currently `is_active=false`) | **You / Jade** (content judgment), **AI** (tooling) | AI generated them and can build the review UI/export, but a nursing-exam SME (you or Jade) has to actually judge clinical accuracy before anything goes live to students. This is the single biggest remaining content-risk item in Phase 1. |
| Teacher review UI for the above | **Done — live on prod** (Claude, 2026-09-19) | `20260919010000_question_review_workflow.sql` is applied to prod (verified 2026-09-24) and `/teacher/review` is deployed. Remaining fragment: Jade still needs a **prod** teacher account — he has one on staging. |
| Frontend build-out: `/study`, `/teacher`, `/admin`, `/super-admin` | **Done — deployed** (Kimi, 2026-09-19) | Built against the real schema, restyled to the reference design (`docs/design-spec-okcomputer.md`). 24 pages under `src/app/`; shipped in the 2026-09-20 push. **You**: a look-over whenever convenient, but nothing blocks on it. |
| Mock exam student/teacher UI | **Done — deployed** (Kimi, 2026-09-19) — **you**: sanity-check the rationale gate against a real attempt | Student runner (zero feedback while answering), results gated on `rationale_released_at`, teacher set builder + one-way release. The gate is enforced at the app layer, so it is worth seeing once with your own eyes on a real exam. |
| Analytics / rank system (reference: AnalyticsPage, RankSystemPage) | **You** (decision), then **AI** (build) | The reference prototype has these pages but our schema has no analytics/performance/rank tables — no data model exists to build against. Needs your call on what to track before anyone builds it. |
| T16 — verify email templates | **AI** (Kimi) | Low-stakes dashboard check. |
| Three unreviewed docx files in Jade's RENR folder | **You** (decision), then **AI** (processing) | Need your read on what Jade actually wants before any script touches them — could be new content, could be duplicate drafts. |

The pattern across all of these: **AI can build anything mechanical or well-specified;
only you (or Jade) can make the content-accuracy and product-policy calls that decide
what "correct" or "done" means here.** That split doesn't change as the project grows
— every new task should get sorted the same way before deciding who runs it.

---

## Week 1 — Supabase Setup & Schema (T01–T14): **done**
T01 Create Supabase project · T02 Create staging project · T03 Install Supabase CLI ·
T04 Configure env vars · T05 Install Supabase JS client · T06 Reference tables
migration · T07 Core content tables · T08 Study content tables · T09 User profile
table · T10 Performance indexes · T11 `user_role()` helper · T12 RLS policies (all
tables) · T13 Seed RENR domains · T14 Seed topic scaffolding.

## Week 2 — Authentication & Role System (T15–T24)
| Task | Status | Notes |
|---|---|---|
| T15 Enable email provider | done | |
| T16 Email templates | **needs-verify** | last known state was `pending` — check Supabase dashboard before closing Week 2 |
| T17 Allowed redirect URLs | done | |
| T18 Signup trigger function | done | `handle_new_user` |
| T19 `user_role()` helper (verify) | done | |
| T20 Test trigger manually | done | |
| T21 Auth middleware / route guards | done | `middleware.ts` |
| T22 Role-based routing after login | done | `ROLE_HOME` in `src/lib/auth/roles.ts` |
| T23 Auth context / `useUser` hook | done | |
| T24 Test all four role flows | done | |

## Week 3 — Question Content Migration (T25–T35): **done through T32**
| Task | Status | Notes |
|---|---|---|
| T25 Export existing question content | done | Jade's 100-question docx pair parsed to CSV |
| T26 Field mapping document | done | `docs/phase-1/FIELD_MAPPING.md` |
| T27 Identify edge cases | done | `docs/phase-1/EDGE_CASES.md` |
| T28 Write migration script | done | `scripts/migrate-questions.ts` (+ CLUSTER_ALIASES fix, commit `a93d7b5`) |
| T29 Dry-run on staging | done | |
| T30 Fix errors and re-run | done | partial-unique-index `ON CONFLICT` fix |
| T31 Run migration on production | done | 100 q / 400 options, `CONFIRM_PROD` path replicated as verified SQL |
| T32 Count validation | done | 0 errors across all integrity checks, see `PROGRESS.md` |
| T33 Sample QA — 20 questions | **pending** (script done) | `scripts/qa-sample.mjs` built + tested on staging 2026-09-19 (0 flags DB-vs-CSV). Remaining: Ian reads the sample against the source docx |
| T34 RLS end-to-end test | **done** (Kimi, staging, 2026-09-19) | 15/15 assertions pass, no policy fixes needed — see `VALIDATION_REPORT.md` and findings below |
| T35 Notify client — M2 delivered | **pending** | Ian's task, not AI |

### T34 findings (from Kimi's `scripts/e2e-rls-test.mjs` run on staging, 2026-09-19)

All 15 assertions passed against the T12 policy set as deployed — no policy changes
required. Two items surfaced that are product/hardening decisions, not bugs, and
need your call before anyone acts on them:

1. **Students can read inactive questions.** The `questions: authenticated read`
   policy has qual `true`, so students see both active and inactive rows (staging
   had 100 active / 900 inactive at test time). If students should only see active
   questions, that's a one-line policy change (`is_active = true`) — not applied,
   pending your decision.
2. **`anon`/`authenticated` hold broad table-level grants** (INSERT/UPDATE/
   DELETE/TRUNCATE/TRIGGER) on `questions` and `profiles`; RLS is the only thing
   currently stopping misuse. Kimi recommends a defense-in-depth migration to
   `REVOKE` write grants those roles don't need. Reasonable hardening, not urgent
   since RLS already blocks it — your call on priority.

Also worth knowing: PostgREST returns `200 + []` (not a 4xx) for an RLS-denied
SELECT/UPDATE/DELETE — only INSERT raises an explicit 403. Anyone writing more RLS
tests against this schema needs to assert on affected-row counts, not HTTP status.

## Addendum — Mock Exam / Database Layer (T36–T38): **done**
T36 Mock exam tables migration · T37 Mock exam RLS + rationale-release gate ·
T38 Full-text search for mock exam review.

## Jade's prototype (`OKComputer_NRG_Website/`) — reviewed 2026-09-20

Full inventory in `PROGRESS.md`. Short version: a working Vite/React prototype (11
pages), ~11,400 questions, ~16 Word specs, and 15 topic-review decks. **The folder is
gitignored** — it breaks `next build` if type-checked — so `PROGRESS.md` is the only
record that travels.

Taken from it already: his 25-level Benner rank ladder, his XP award values, and his
study-streak definition (all live in `src/lib/xp/` + migrations `20260920030000`,
`20260920040000`).

| Next candidate | Blocked on |
|---|---|
| Topic reviews (15 decks ready) | Nothing — best content-value-per-effort item left |
| Nursing Knowledge facts | **Built (133 facts).** Needs Jade's clinical sign-off — see `docs/phase-1/nursing-knowledge-facts-for-review.pdf` |
| Topic Elo + real analytics | Practice needs per-answer rows, not just session totals |
| Import prototype questions | **Staging import done + key pool cleared (2026-09-20)** — now **4,798** rows in the review queue (`source='prototype-import'`, all `is_active=false`/`pending`), independently re-verified with 0 key errors, letter references idempotently correct, RLS 15/15. The 77 key-mismatch items were all false positives of the token-overlap heuristic: 70 hand-reviewed and promoted, 7 compound-option items held for human review. The export is now deterministic per question, so later edits cannot reshuffle unrelated rows. **Blocked on:** Jade's clinical review/approval, which is the only real gate left. The prod import is unblocked (`20260920050000` is on prod) and the topic clusters are applied on staging; the 269 copyright-flagged items need Ian's drop-or-keep call first. |
| Rank-up exams | The question import above |
| Case study simulator (100 cases) | A new schema for vitals/labs/phases |
| Q-gen AI grading | An LLM key and budget |
| Group study / live sessions | Realtime infra + Google Meet |
| Subscriptions | **Pricing is unwritten** in the spec |

**Decisions only Ian or Jade can make:** rank naming (the brief says Bronze→Diamond,
`rankSystemData.ts` says Benner — I followed Benner); free-tier limits (v1 says 50
questions/day, v2 says 10/day and no mocks); pricing; and whether to keep the
Saunders-derived and verbatim-NCLEX questions at all.

## Not yet tracked (post-T38, no task IDs assigned)

- **Question provenance**: FIXED on staging and prod (Claude, 2026-09-20).
  360 of Jade's own questions were live on prod flagged `is_ai_generated=true` with no
  author tag and `review_status='approved'` / `reviewed_by=NULL` — nobody had approved
  them. Ian confirmed they are Jade's writing; `20260920070000` corrects the flag,
  tags them `Author: Jade Nicome`, leaves `is_active` alone (prod stays 460 live,
  staging stays 100), and adds `questions_approval_needs_a_reviewer` so an AI question
  can never again be approved without a named reviewer. The 2,000 AI questions are
  identical in both environments and were always inert; duplication is impossible via
  the unique `source_id` index plus upsert. **Nothing outstanding.**
  Prod and staging deliberately differ on live content (460 vs 100) and staging holds
  56 questions prod lacks (`jade:nrg-qbank-starter-56`) — Ian's call, staging is a
  sandbox.
- **Group exams + exam timer**: DONE and LIVE on prod (Claude, 2026-09-20). Up to 5
  students sit the same paper at the same time, each answering for themselves, so
  XP/rank/streak/fatigue all keep working unchanged; a shared answer sheet was rejected
  because it would make rank mean "was in good groups". Students form groups with a
  6-character join code, teachers assign them to named students and see results.
  Optional `duration_minutes` per set, enforced in RLS rather than only by the browser
  countdown, with lazy settlement of abandoned attempts. The per-question review is
  withheld until the last group member hands in, because it names the correct option.
  Migrations `20260920050000` + `20260920060000` applied to staging then prod; 62
  assertions across database, student UI and teacher UI; prod policies verified in
  `pg_policies` after the apply. **Nothing outstanding** — but note no student has used
  it yet, so the first real group run is worth watching.
  Worth deciding later: a non-assessed collaborative mode (one shared answer sheet,
  flat XP, excluded from readiness) as a separate practice feature.
- **Review venue for the staging bank**: DONE and live (Claude, 2026-09-20) —
  **https://nrg-platform-staging.vercel.app**, a second Vercel project
  (`nrg-platform-staging`) on the same repo with its own env vars pointing at the
  staging Supabase project. Publicly reachable because it is that project's production
  alias; a preview URL would not have worked, since the org uses Vercel Standard
  Protection and every per-deployment URL 302s to `vercel.com/sso-api` (the account is
  Hobby, so Jade could not be invited either). Its production branch is `main`, not a
  separate `staging` branch — Vercel's API will not set the production branch, and
  tracking `main` is better anyway: current code, staging data, nothing to keep in sync.
  A push to `main` now updates both sites. Verified black-box that each site talks only
  to its own database; prod env vars untouched. Jade: `jade@nrg-staging.test` (teacher),
  then `/teacher/review` → Source → "Prototype bank (imported)". 7/7 live assertions
  plus a 7-page smoke test. **Owner: Ian** — send Jade the URL and password.
  Note the URL is public with open signup; the 4,798 imported questions are all
  inactive so a stranger cannot see them, but Password Protection is Pro-only.
- **Topic clusters for the imported bank**: APPLIED to staging (Claude, 2026-09-20) on
  Ian's go-ahead. All 726 previously cluster-less topics now have a clinical area; 0
  questions left without one, down from 4,630 of 7,314. Exactly 726 rows changed, no
  already-clustered topic touched, no topic renamed, prod untouched, nothing live.
  Whole-bank spread: med-surg 2,487 · maternal-child 2,033 · professional 1,409 ·
  safety 908 · psychosocial 477. Done as 101 segment decisions rather than 726 topic
  decisions — see `docs/phase-1/TOPIC_CLUSTER_PROPOSAL.md`. Deliberately did NOT
  collapse the 726 topics (only 7% restate the RENR domain; 673 name a real sub-topic)
  and did NOT add clusters. **Owner: Jade** — the mapping wants a nursing eye on the
  arguable calls the doc flags; correcting one means editing `RULES` in
  `scripts/propose-topic-clusters.ts` and re-running `--apply`.
- **Copyright decision on 269 held-back questions**: AWAITING Ian/Jade. List at
  `docs/phase-1/COPYRIGHT_REVIEW_LIST.md` (identifiers only — no stems in git).
  145 Saunders-derived + 124 verbatim NCLEX (0 rationales). Recommendation in the doc:
  drop rather than rewrite. **Owner: Ian.**
- **`topics.domain_id` is NULL for every topic in both environments** — pre-existing,
  not caused by any import; the migrate script never sets it and topics de-duplicate by
  name alone. Question-level domain is correct, so nothing is broken today. Either
  populate the column or drop it. **Owner: AI**, once someone decides which.
- **AI-generated question review workflow**: DONE and LIVE ON PROD (Claude,
  2026-09-19). 2,000 AI questions sit in prod as `is_ai_generated=true`,
  `review_status='pending'`, all `is_active=false` — inert, never seen by a student.
  `20260919010000_question_review_workflow.sql` is applied to prod and staging
  (verified 2026-09-24) and `/teacher/review` is deployed to both. **What is actually
  outstanding is the reviewing, not the tooling** — Jade has to judge the questions,
  and he needs a prod teacher account to do it there (he has one on staging).
- **Frontend build-out**: DONE 2026-09-19 (Kimi) — `/study` lobby + practice/tutor
  mode + flashcards + case studies, `/teacher` dashboard, `/admin` + `/super-admin`
  read-only dashboards, all restyled to the reference layouts the same day (see the
  "Design restyle pass" entry in `PROGRESS.md`). Deployed in the 2026-09-20 push;
  24 pages under `src/app/`. Nothing outstanding.
- **Mock exam UI**: DONE 2026-09-19 (Kimi) — student exam runner + results, teacher
  set builder + rationale release. App-layer rationale gate implemented per T36–T38
  rules. See `PROGRESS.md`.
- **Fatigue analysis**: DONE 2026-09-19 (Claude) — student results + teacher cohort
  card, from the client's `Fatigue_Analysis_Data_Prompt.docx`. No schema change.
  Several parts of that spec were deliberately not followed (statistically unsound
  15-point rule, fabricated instructor scores, an LLM call for deterministic maths) —
  reasons in `PROGRESS.md`. Deployed in the 2026-09-20 push; no schema change was
  needed, so nothing is outstanding.
- **Student profile + messaging**: DONE 2026-09-19 (Claude) — `/study/profile` and
  `/teacher/messages`, threads that can cite a mock exam attempt. Needs migration
  `20260919020000_student_messaging.sql` on prod; it REPLACES the `profiles` SELECT
  policy so each side can see the other's name along a shared conversation, and
  `20260919030000_staff_initiated_threads.sql`, which lets Jade write first and
  widens that policy so teachers can read the student roster. **Both applied to prod
  2026-09-19 and smoke-tested there; the feature is live.** Remaining: Jade needs a
  prod account promoted to `teacher` (SQL in `PROGRESS.md`). See `PROGRESS.md`.
- **Teacher approval + account admin**: DONE 2026-09-19 (Claude) — signup asks
  student/teacher, teachers need approval at `/admin`, plus role change, suspend and
  delete. Ian and Jade are in `admin_contacts` and become `super_admin` on signup
  (Ian's existing account is promoted by the migration). Needs
  `20260919040000_teacher_approval_and_admin.sql`, **applied to prod 2026-09-19 and
  smoke-tested there; live.** Jade just needs to sign up (auto super_admin).
  Email notification is
  wired to Resend but dormant until `RESEND_API_KEY` is set in Vercel.
  **Action for Ian:** Supabase's built-in email is rate-limited to a few per hour —
  configure custom SMTP before real signups. See `PROGRESS.md`.
- **Profile pictures**: DONE 2026-09-19 (Claude) — upload on `/study/profile`, shown
  in the header, message threads and admin table. Needs
  `20260919050000_avatar_storage.sql`, **applied to prod 2026-09-19 and smoke-tested
  there; live.** See `PROGRESS.md`.
- **Event calendar**: DONE 2026-09-19 (Claude) — month calendar on `/study/profile`
  for every role. Students add private entries (invisible to staff by design);
  teachers/admins publish to everyone, all students, staff, or named students. Needs
  `20260919060000_calendar_events.sql`, **applied to prod 2026-09-19 and smoke-tested
  there; live.** See `PROGRESS.md`.
- **Levelling (XP + ranks + student submissions)**: DONE 2026-09-20 (Claude) — Benner
  ranks Novice→Expert, XP ledger, `/study/submit` for student-authored questions
  feeding the existing review queue, and practice-session tracking. Needs
  `20260920010000_xp_ranks_and_submissions.sql` and
  `20260920020000_teachers_can_review_submissions.sql`, **both applied to prod
  2026-09-20 and smoke-tested there; live.** See `PROGRESS.md`.
- **Analytics / rank pages**: partly addressed — `practice_sessions` now collects
  study-habit data, and XP/ranks exist. Leaderboards and the analytics pages
  themselves are still not built — no backing tables in our schema; needs Ian's
  data-model decision first (see Phase 1 table above).
- **Three unreviewed docx files** in Jade's RENR folder — see `PROGRESS.md`.
- **Local AI provider wiring**: `scripts/generate-questions.ts` already supports
  `--provider ollama` for locally-run models — this is existing capability, not new
  work, but hasn't been exercised/verified end-to-end.

---

## What to hand off to Kimi

Kimi runs locally on your Mac, so it's well-suited to anything that's mechanical,
self-contained, and doesn't need production Supabase judgment calls or client
communication. Good candidates, roughly in priority order:

0. **Prototype data audit** — *(Done 2026-09-20 by Kimi: `scripts/audit-prototype-data.ts`, report at `docs/phase-1/PROTOTYPE_DATA_AUDIT.md`, clean CSV `scripts/data/proto-import-clean.csv` — 4,728 rows, offline-validated, nothing imported.)* Verdict: answer keys are sound (skew was paste-order, now shuffled); the 4,000-item mock pool is mostly duplicates of the banks and contributes nothing auditable. **Staging import also done the same day** (4,728 rows as pending AI review queue, verified, nothing live — see PROGRESS.md). Remaining: Jade's clinical review, copyright call on 269 items, quarantine review pools, prod application (migration `20260920050000` first), topic-taxonomy decision.

1. **T33 — Sample QA script.** *(Done 2026-09-19 by Claude: `scripts/qa-sample.mjs`; only the human read-and-verify remains.)* Write a script that pulls 20 random questions tagged
   `Author: Jade Nicome` from prod, prints them alongside the matching rows in
   `data/questions.csv` (or the original docx text), for manual side-by-side review.
   The *scripting* is a good Kimi task; the actual judgment call on "is this an
   accurate transcription" should stay with you or Jade.

2. ~~**Frontend page build-out** for `/study`, `/teacher`, `/admin`.~~ *(Done
   2026-09-19 by Kimi and deployed — 24 pages under `src/app/`. Left here because the
   reasoning still holds for the next UI task: hand Kimi a spec naming the components,
   the Supabase queries and the role guards, and it can grind through UI work without
   ever needing production credentials.)*

3. ~~**AI-generated question review UI**~~ *(done 2026-09-19, live on prod and
   staging — `/teacher/review`.)*

4. **T16 verification** — check the Supabase dashboard for email template state and
   fix if still default/pending. Low-stakes, mechanical.

5. **RLS hardening migration** (optional, from T34 findings) — `REVOKE` unneeded
   table-level write grants from `anon`/`authenticated` on `questions` and
   `profiles` as defense-in-depth. Mechanical once you decide it's worth doing.

**Keep with yourself (or me) rather than handing to Kimi:**
- T35 (client notification — needs your voice, not an AI's)
- The policy decision on whether students should see inactive questions (T34
  finding #1) — Kimi flagged it, you decide, then anyone can implement the one-line
  policy change
- Anything touching prod Supabase writes directly (schema changes, data migrations)
  until there's a staging-first workflow Kimi can be trusted to follow unsupervised
- The three unreviewed docx files — needs a judgment call on what Jade actually
  wants before any script goes near them
- Final review of anything Kimi builds before it touches prod

## How to hand a task to Kimi

Point it at this repo plus `PROGRESS.md` and this file — that's the whole context
transfer, no chat history needed. Give it the specific task ID/section above, the
relevant files it should look at, and tell it explicitly: staging first, never touch
prod credentials directly, update `PROGRESS.md` when done. T34 is a good template
for how this went — Kimi delivered a scripted test suite plus a written report
(`VALIDATION_REPORT.md`) with findings flagged rather than acted on unilaterally.
