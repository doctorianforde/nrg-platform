# NRG Platform — Plan / Task Tracker

Companion to `PROGRESS.md` (what's done and why). This file is the task list and
hand-off map. Update status inline as tasks close; don't let this drift from
`PROGRESS.md` — if they disagree, `PROGRESS.md`'s narrative is the source of truth
for *what actually happened*, this file is for *what's left and who does it*.

## Status legend
`done` · `pending` · `needs-verify` (marked done before, not re-confirmed) · `blocked`

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
| Teacher review UI for the above | **Done on staging** (Claude, 2026-09-19) — **you**: OK the prod migration + deploy | Built `/teacher/review`; tested 22/22 on staging. Waiting on your go-ahead to apply `20260919010000_question_review_workflow.sql` to prod, deploy, and give Jade a teacher account. See `PROGRESS.md`. |
| Frontend build-out: `/study`, `/teacher`, `/admin`, `/super-admin` | **Built + restyled** (Kimi, 2026-09-19) — **you**: review + deploy when ready | Built against the real schema (no migrations), then restyled page-by-page to the reference design. Full design spec saved at `docs/design-spec-okcomputer.md`. See `PROGRESS.md`. |
| Mock exam student/teacher UI | **Built + restyled** (Kimi, 2026-09-19) — **you**: review the rationale-gate behavior before deploy | Student exam runner (zero feedback while answering), results with rationales gated on `rationale_released_at`; teacher set builder + deliberate one-way release button. Business rules enforced at app layer; restyle touched markup only. See `PROGRESS.md`. |
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

## Not yet tracked (post-T38, no task IDs assigned)

- **AI-generated question review workflow.** 2,000 AI-generated questions exist in
  prod as `is_ai_generated=true`, all `is_active=false` (confirmed). Review UI + schema
  are built and tested on staging (2026-09-19); prod migration/deploy pending Ian's OK.
- **Frontend build-out**: DONE 2026-09-19 (Kimi) — `/study` lobby + practice/tutor
  mode + flashcards + case studies, `/teacher` dashboard, `/admin` + `/super-admin`
  read-only dashboards. Restyle against the reference's exact page layouts pending.
  See `PROGRESS.md` (2026-09-19 entry).
- **Mock exam UI**: DONE 2026-09-19 (Kimi) — student exam runner + results, teacher
  set builder + rationale release. App-layer rationale gate implemented per T36–T38
  rules. See `PROGRESS.md`.
- **Fatigue analysis**: DONE 2026-09-19 (Claude) — student results + teacher cohort
  card, from the client's `Fatigue_Analysis_Data_Prompt.docx`. No schema change.
  Several parts of that spec were deliberately not followed (statistically unsound
  15-point rule, fabricated instructor scores, an LLM call for deterministic maths) —
  reasons in `PROGRESS.md`. Needs deploy only; nothing pending on prod DB.
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
- **Analytics / rank pages**: not built — no backing tables in our schema; needs Ian's
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

1. **T33 — Sample QA script.** *(Done 2026-09-19 by Claude: `scripts/qa-sample.mjs`; only the human read-and-verify remains.)* Write a script that pulls 20 random questions tagged
   `Author: Jade Nicome` from prod, prints them alongside the matching rows in
   `data/questions.csv` (or the original docx text), for manual side-by-side review.
   The *scripting* is a good Kimi task; the actual judgment call on "is this an
   accurate transcription" should stay with you or Jade.

2. **Frontend page build-out** for `/study`, `/teacher`, `/admin`. These are
   well-scoped once you hand Kimi a spec (which components, which Supabase queries,
   which role guards apply) — good fit for a local coding agent grinding through UI
   work without needing production credentials.

3. **AI-generated question review UI** *(done on staging 2026-09-19 — see `PROGRESS.md`)* — a teacher-facing page listing
   `is_active=false` questions with approve/reject/edit actions. Same reasoning as
   above: well-specified once scoped, mechanical to build.

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
