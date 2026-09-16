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
