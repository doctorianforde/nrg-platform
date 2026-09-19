# Kimi frontend build-out prompt

Context for this prompt: read PROGRESS.md, PLAN.md, and CLAUDE.md at the repo
root first — they're the standing project record. This prompt is for the
next big Kimi task: building out the actual frontend pages.

---

We have a design/UX reference for this build: OKComputer_NRG_Website_v62/ in
the repo root. It's a full built prototype (compiled Vite/React app), NOT
part of this codebase and NOT something to copy code from — it's a different
framework's production build (minified JS bundles), so there's no readable
source to lift. Treat it as a reference only:

1. VIEW IT RUNNING to see the actual designed pages and flows. It's a static
   SPA — serve it locally, don't just open index.html via file://:
     npx serve OKComputer_NRG_Website_v62
   Click through every page you can reach: home, login, study lobby,
   question bank, quiz session, case study, mock exam, instructor dashboard,
   question generation, analytics, rank/gamification.

2. EXTRACT THESE DIRECTLY (real, reusable assets, not code):
   - OKComputer_NRG_Website_v62/images/ — logo (nrg-logo.png) and feature
     images. Copy the ones you need into this app's /public directory.
   - OKComputer_NRG_Website_v62/sounds/ — correct/wrong answer effects for
     the quiz flow, if we want sound feedback.
   - Font stack from its index.html: Inter, Nunito Sans, Poppins (Google
     Fonts) — match this project's existing Tailwind config to these if it
     isn't already.
   - Color palette / spacing feel — inspect assets/index-*.css for the
     actual values used (it's minified but readable with formatting), don't
     guess at colors.

3. DO NOT try to port its React components or logic. Its mock exam pages
   (mockExamPoolBatch1–4) bundle fake question data directly into the JS —
   ignore that entirely; our real data comes from Supabase
   (public.questions, question_options, mock_exam_sets/sessions/responses).

## What to actually build

Real target: the Next.js 14 App Router routes in src/app/ — check current
state first (README.md and PROGRESS.md flag these as likely still scaffolds,
not built out). Route guards, auth, and role-based redirect already exist
(T21–T23) — build inside that, don't rewrite it.

Priority order:

1. /study (student) — question practice flow, browsing by domain/topic,
   a quiz session UI modeled on QuizSessionPage/QuestionBankPage from the
   reference, flashcards, case studies (case_studies /
   case_study_questions tables already exist).

2. /teacher — this is the most business-critical page right now. We just
   shipped a review workflow on prod (migration
   20260919010000_question_review_workflow.sql): every AI-generated
   question has a review_status (pending/approved/needs_changes/rejected)
   and can only go is_active once approved. There are 2,000 questions
   sitting in `pending` right now with nobody able to review them — this
   page is what unblocks that. Look at QuestionGenerationPage in the
   reference for UI patterns (filters, approve/reject/edit actions), but
   wire it to review_status / reviewed_by / reviewed_at / review_notes on
   public.questions, gated by can_manage_question() (already deployed).

3. /admin and /super-admin — dashboards; lower priority than /teacher.

4. Mock exam UI (student + teacher) — schema and RLS already exist
   (T36–T38). Remember the business rule: no rationale shown during the
   exam; a teacher must explicitly release it afterward
   (rationale_released_at on mock_exam_sets). Don't build any
   auto-reveal or time-based release — it's a deliberate button.

5. Analytics / rank system (AnalyticsPage, RankSystemPage in the reference)
   — nice-to-have, not yet scoped against our schema. Flag this as an open
   question for Ian rather than inventing a data model for it.

## Rules
- Staging first for anything schema-related; never touch prod without Ian.
- Don't invent product/policy decisions (e.g. what counts as a passing mock
  exam score, gamification rules) — build the mechanical parts, flag
  judgment calls in PROGRESS.md for Ian.
- Update PROGRESS.md and PLAN.md when you finish or pause a page.
