# NRG Platform — Claude Code Instructions

Before starting any work in this repo, read PROGRESS.md and PLAN.md at the
project root. They are the durable, portable record of what's done, what's
left, and who (human vs AI) owns each remaining task — kept in sync with
Kimi and other AI tools, not just this session's chat history.

Rules:
- Staging (`kwhaqhhwqykckarjbdod`) before prod (`cdvubijjepwmhhkgppbl`) for any
  schema change or migration. Never run untested SQL against prod.
- Never touch production credentials/service-role keys directly without Ian's
  explicit go-ahead.
- When you finish a task, update PROGRESS.md (what happened) and PLAN.md
  (status table) before ending the session — don't leave them stale.
- See PLAN.md's "you vs. AI" table for what's actually appropriate to pick up
  autonomously vs. what needs Ian's judgment call first.

## Connecting the Supabase CLI (`db push`, `migration up`, etc.)

Both prod and staging DB hosts are IPv6-only. Depending on the local network
path, direct connections to `db.<ref>.supabase.co:5432` can fail with a bare
"Failed to connect" — this is a TCP-level reset mid-handshake, not a bad
password, and the CLI's own error message won't tell you the difference.
Diagnosed 2026-09-19: connecting via the Supavisor pooler instead (which is
dual-stack / has an IPv4 address) avoids the reset entirely.

**Always connect via the pooler, not the direct host:**

```bash
# 1. Get the password into the shell without it touching history or chat
read -s SUPABASE_DB_PASSWORD
export SUPABASE_DB_PASSWORD

# 2. Sanity-check it's actually set (prints a number, never the password)
echo "password length: ${#SUPABASE_DB_PASSWORD}"

# 3. URL-encode it — Supabase-generated passwords often contain characters
#    (!, $, %, &, etc.) that break a hand-built connection string if used raw
ENCODED_PW=$(python3 -c "import urllib.parse, os; print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))")

# 4. Push through the pooler (swap the ref for staging: kwhaqhhwqykckarjbdod)
npx supabase db push --db-url "postgresql://postgres.cdvubijjepwmhhkgppbl:${ENCODED_PW}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

If this still fails with an explicit `password authentication failed` (not a
bare "Failed to connect"), the password itself is wrong — redo the reset in
Settings → Database, watch for an explicit confirmation the change applied,
and repeat steps 1–4 with the new value.

If direct-to-prod access is ever needed for something the CLI can't do,
Claude (cloud session) also has a Supabase MCP connector that reaches both
projects over HTTPS — useful when the local network path is the problem, but
note that connector is blocked from applying migrations to *prod* by design
(a safety gate, not a bug); it can push freely to staging and hand over exact
SQL for a manual paste into the prod SQL Editor.
