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
the only `is_active=true` rows — 100/2,100 total). **No review/activation step or UI
exists yet** — see "How to access questions to review" below and the review-workflow
item in `PLAN.md`.

## T34 — RLS end-to-end test: done (Kimi, staging, 2026-09-19)

Ran via `scripts/e2e-rls-test.mjs` against staging with real JWT sessions for
student/teacher×2/admin plus anon — 15/15 assertions passed, no policy fixes needed.
Two non-blocking findings need your decision (not yet actioned): students can read
inactive questions under the current policy qual, and `anon`/`authenticated` hold
broader table-level grants than RLS strictly requires (defense-in-depth candidate).
Full detail in `PLAN.md` and `VALIDATION_REPORT.md`.

## Not yet done / not yet verified

- **T33 — Sample QA on 20 of Jade's real questions**: spot-check the migrated DB rows
  against the original docx source for transcription accuracy. Not done this
  session.
- **T35 — Notify client (Jade) that M2 is delivered.** Not done — this is Ian's call,
  not an AI task.
- **Three unreviewed files** in `Downloads/RENR/NRG RENR QUESTIONS/`:
  `NRG_100_New_Questions.docx`, `NRG_Rewritten_Sample_Questions_1_Questions_Only.docx`,
  `NRQ_Rewritten_Sample_Questions_1.docx`. Unknown whether these are new content or
  alternate drafts of the same 100 questions — flagged, not investigated.
- Frontend build-out for `/study`, `/teacher`, `/admin`, `/super-admin` — route
  guards and auth exist, but the actual page UIs (question practice flow, flashcards,
  case studies, teacher review queue for AI-generated questions, mock exam UI) are
  largely unbuilt as of this log. Check `src/app/` directly for current state before
  assuming anything here is stale.

## How to access questions to review

No review UI exists yet (that's on the not-yet-built list), so for now review
happens directly against the database. Both are read-only browsing — safe to do on
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

- `HEAD` as of this log: `a93d7b5` on `main`, pushed to `origin/main`, no divergence.
