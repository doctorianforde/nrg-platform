# NRG Platform — Supabase Environments

Organization: **NRG Platform** (`kpgrvcbifaydjwgqaxvh`) · Region: **us-east-1**

> Rule: all schema changes (SQL migrations) and the question migration script go to
> **staging first**, then to prod — never run migrations on prod without a clean
> dry-run on staging.

## Production — `nrg-platform-prod`

- Status: ACTIVE_HEALTHY (created 2026-09-15, T01)
- Project ref: `cdvubijjepwmhhkgppbl`
- URL: `https://cdvubijjepwmhhkgppbl.supabase.co`
- DB host: `db.cdvubijjepwmhhkgppbl.supabase.co`
- Keys: stored in `.env.production` (T01) — **never commit to git**

## Staging — `nrg-platform-staging`

- Status: ACTIVE_HEALTHY (created 2026-09-15, T02)
- Project ref: `kwhaqhhwqykckarjbdod`
- URL: `https://kwhaqhhwqykckarjbdod.supabase.co`
- DB host: `db.kwhaqhhwqykckarjbdod.supabase.co`
- pgvector: enabled (v0.8.2, schema `public`)
- Keys: stored in `.env.staging` — **never commit to git**

## Which key belongs where

| Item | Production | Staging |
|---|---|---|
| Project ref | `cdvubijjepwmhhkgppbl` | `kwhaqhhwqykckarjbdod` |
| URL | `https://cdvubijjepwmhhkgppbl.supabase.co` | `https://kwhaqhhwqykckarjbdod.supabase.co` |
| Anon key | in `.env.production` | in `.env.staging` |
| service_role key | dashboard only (Settings → API) | dashboard only (Settings → API) |
| DB password | password manager | password manager (separate from prod) |

Note: the `service_role` key bypasses Row Level Security — it is only ever shown in
the Supabase dashboard (Settings → API) and cannot be retrieved via API. Copy each
environment's key directly from its own project's dashboard.

## Deployed sites (Vercel)

Two Vercel projects share the one GitHub repo (`doctorianforde/nrg-platform`), both
with production branch `main`. **A push to `main` deploys both.**

| Site | Vercel project | Database | Public |
|---|---|---|---|
| `nrg-platform.vercel.app` | `nrg-platform` | **prod** `cdvubijjepwmhhkgppbl` | yes |
| `nrg-platform-staging.vercel.app` | `nrg-platform-staging` | **staging** `kwhaqhhwqykckarjbdod` | yes |

Each project sets the same three variables — `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — to its own environment's
values. The app code reads the plain names (`src/lib/supabase/*.ts`), so which database a
deployment talks to is decided entirely by that project's variables. The `_STAGING`
suffixed names exist only in local `.env.local` for scripts.

The staging site is the review venue for content that is not yet approved: Jade signs in
there and works `/teacher/review` against the staging bank, with no path to prod.

**Preview URLs do not work for anyone outside the Vercel account.** The org uses Vercel
Standard Protection (`ssoProtection: all_except_custom_domains`), so every
per-deployment URL 302s to `vercel.com/sso-api`; only a project's production alias is
public. The account is on the Hobby plan, which has no team members, so an outside
reviewer cannot be invited to a protected deployment. That is why staging is a second
project rather than a branch preview.

Both public URLs have open signup. Unapproved questions are `is_active=false` and
invisible to students, so a stranger who signs up sees only approved content. Password
Protection would close the signup exposure but is a Pro-plan feature.
