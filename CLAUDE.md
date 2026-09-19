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
