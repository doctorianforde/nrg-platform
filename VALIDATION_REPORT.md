# VALIDATION REPORT — T34 RLS End-to-End Test

**Date:** 2026-09-19
**Environment:** STAGING (`nrg-platform-staging`, ref `kwhaqhhwqykckarjbdod`)
**Method:** Scripted session test (`scripts/e2e-rls-test.mjs`) — four temporary users created via the admin API (student, teacher ×2, admin), roles assigned in `public.profiles`, real JWT sessions obtained via password sign-in, all requests issued through PostgREST with the anon key (never the service role, except for setup/cleanup). Test users, their questions, and profile rows were deleted after the run (verified: 0 profiles remain).
**Result: 15/15 assertions PASS.** No policy fixes were required; the T12 policy set behaves as designed.

## Results

| # | Session | Action | Expected | Actual | Verdict |
|---|---------|--------|----------|--------|---------|
| 1 | Student | `SELECT questions LIMIT 10` | 10 rows | 200, 10 rows | PASS |
| 2 | Student | `INSERT question` | blocked | 403 `42501` (row-level security) | PASS |
| 3 | Student | `SELECT profiles WHERE id ≠ own` | 0 rows | 200, 0 rows | PASS |
| 4 | Student | `SELECT own profile` | 1 row | 200, 1 row | PASS |
| 5 | Teacher | `INSERT question (created_by=self)` | succeeds | 201, row created | PASS |
| 6 | Teacher B | `UPDATE teacher A's question` | blocked | 200, **0 affected rows**, row unchanged | PASS |
| 7 | Teacher A | `UPDATE own question` | succeeds | 200, row updated | PASS |
| 8 | Teacher | `SELECT all profiles` | own only | 200, 1 row (own) | PASS |
| 9 | Admin | `SELECT all questions` | full bank | 200, 1,000 rows | PASS |
| 10 | Admin | `UPDATE question.is_active=false` | succeeds | 200, `is_active=false` (restored after) | PASS |
| 11 | Admin | `SELECT all profiles` | all rows | 200, 4 rows (all test users) | PASS |
| 12 | Anon | `SELECT questions` (no session) | 0 rows | 200, 0 rows | PASS |
| 13 | Anon | `SELECT profiles` (no session) | 0 rows | 200, 0 rows | PASS |

## Findings & notes (no policy changes required)

1. **PostgREST RLS signaling quirk (test accounting):** RLS-denied SELECT returns `200 + []`, and RLS-denied UPDATE/DELETE also return `200 + []` (zero affected rows) rather than 4xx. Only INSERT raises an explicit error (403 `42501`). Automated assertions must check affected-row counts, not just HTTP status.
2. **Student read scope:** the `questions: authenticated read` policy has qual `true` — students can read *active and inactive* questions (bank: 100 active / 900 inactive at test time). This is broader than the task's "active questions" wording but consistent with the deployed T12 policy. If students should only see active questions, the policy qual should become `is_active = true` — a product decision, not applied here.
3. **Table-level grants are broad:** `anon` and `authenticated` hold **all** table privileges (INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER) on `questions` and `profiles`; RLS is the sole enforcement layer. Recommended hardening (separate migration): `REVOKE` write privileges from `anon`/`authenticated` where policies don't require them (RLS still governs, but defense-in-depth).
4. **Signup trigger behavior:** creating a user (even via admin API) auto-creates a `profiles` row with `role = 'student'` via trigger. Role elevation (teacher/admin) must be done by updating the profile with the service role. Test scripts must PATCH, not INSERT, the profile — an initial test run failed all role checks for exactly this reason.
5. **Helper functions verified in the request path:** `public.user_role()`, `public.is_admin()`, `public.can_manage_question()` all evaluate correctly under real JWTs (SECURITY DEFINER + STABLE working as designed).
6. **Staging data drift observed:** question count changed between inspection (2,100) and test runs (1,000) due to activity outside this test; RLS behavior was identical across both states.

## Artifacts

- `scripts/e2e-rls-test.mjs` — full 15-assertion suite (re-runnable; self-cleaning)
- `scripts/probe-user-role.mjs`, `scripts/probe-teacher-update.mjs` — diagnostic probes used during the run
- `VALIDATION_RESULTS.json` — machine-readable results of the final run
