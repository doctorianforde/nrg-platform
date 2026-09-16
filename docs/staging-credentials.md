# NRG Platform — STAGING credentials (nrg-platform-staging)

Project ref: `kwhaqhhwqykckarjbdod` · Region: us-east-1 · Status: ACTIVE_HEALTHY
**Never commit these values. Never point production at them.**
Add `.env*` / this file to `.gitignore`.

## API

```
NEXT_PUBLIC_SUPABASE_URL=https://kwhaqhhwqykckarjbdod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3aGFxaGh3cXlrY2thcmpiZG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MTQwNzQsImV4cCI6MjEwNTA5MDA3NH0.qbcEQnxZ7nTWDZ4QzcBgfBBHwpT2SFH-0Ww6_cUJBSw
```

The **service_role key** is never exposed via API — it must be copied manually from the
staging dashboard: **Settings → API → service_role key** (reveal + copy).
It bypasses Row Level Security; store it only in the password manager / server-side env.
✅ Copied and validated (HTTP 200) — now lives in `.env.local` as
`SUPABASE_SERVICE_ROLE_KEY_STAGING`.

## Direct Postgres (migrations / psql)

```
POSTGRES_HOST=db.kwhaqhhwqykckarjbdod.supabase.co
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_DB=postgres
POSTGRES_PASSWORD=<see password manager: "NRG Platform — Staging DB">
```

Generated DB password (save in password manager, then delete from here if you prefer):

```
h8rNlq0zVU2pDQT1ARF7jPMY
```

Note: Supabase auto-generated its own DB password at project creation (shown under
**Connect** in the dashboard). Either save that one, or rotate it to the generated
password above via **Settings → Database → Reset database password**.
