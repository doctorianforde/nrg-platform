# NRG Platform

Nursing exam preparation for the RENR (Trinidad & Tobago) — practice questions, flashcards,
case studies and teacher-gated mock exams. Client: Jade Nicome · Developer: Dr. Ian A. Forde II.

Stack: Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth) · Vercel.

## Environments
| | Supabase project | Vercel |
|---|---|---|
| Production | `nrg-platform-prod` (`cdvubijjepwmhhkgppbl`) | https://nrg-platform.vercel.app (branch `main`) |
| Staging | `nrg-platform-staging` (`kwhaqhhwqykckarjbdod`) | Vercel Preview deployments (any non-main branch) |

Rule: every schema change and the content migration go to **staging first**, then prod.
See `docs/environments.md`. Secrets live in `.env.local` (git-ignored) and Vercel env vars — never in the repo.

## Local development
```bash
npm install
cp .env.local.example .env.local   # then fill in keys from the Supabase dashboards
npm run dev                        # http://localhost:3000
```

## Database
Migrations are plain SQL in `supabase/migrations/` and are the source of truth.
```bash
npx supabase link --project-ref kwhaqhhwqykckarjbdod   # staging
npx supabase db push
npx supabase link --project-ref cdvubijjepwmhhkgppbl   # prod (after staging is clean)
npx supabase db push
```
Migrations up to `20260916050000` were applied through the Supabase MCP connector and
recorded in `supabase_migrations.schema_migrations`, so `db push` is a no-op for them.

Key points:
- Roles live in `public.profiles.role` (`student|teacher|admin|super_admin`), created by the
  `handle_new_user` trigger on signup. Promote users with SQL — there is no self-service path.
- RLS helper is `public.user_role()` (not `auth.` — hosted Supabase forbids CREATE in `auth`).
- Mock-exam rationale is gated at the **app layer** on `mock_exam_sets.rationale_released_at`;
  the DB only controls who may set it (teacher/admin).

## Auth flow
`middleware.ts` refreshes the session and gates `/study /teacher /admin /super-admin`.
Each page calls `requireRole()` (`src/lib/auth/session.ts`) for the role check.
Email confirmation → `/auth/callback` → dashboard for the user's role (`ROLE_HOME` in `src/lib/auth/roles.ts`).

## Content migration (Week 3)
```bash
npx tsx scripts/migrate-questions.ts --file data/questions.csv --offline            # audit (T25)
npx tsx scripts/migrate-questions.ts --file data/questions.csv --env staging --dry-run
npx tsx scripts/migrate-questions.ts --file data/questions.csv --env staging
CONFIRM_PROD=yes npx tsx scripts/migrate-questions.ts --file data/questions.csv --env prod
```
Working docs: `docs/phase-1/` (audit, field mapping, edge cases, validation report).

## Tracker
Phase 1 task tracker with per-task AI handover prompts: Claude artifact "NRG Phase 1 Tracker".
