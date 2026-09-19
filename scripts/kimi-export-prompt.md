# Kimi progress-export prompt

Paste this into Kimi to get a portable, zipped snapshot of its session
progress — Markdown for humans, JSON for machines — that can be reviewed or
handed to another AI without needing this chat's history.

---

Export your current progress on this project into a portable snapshot I can
hand to another AI or review independently of this chat.

Create a folder named kimi-export-<YYYY-MM-DD-HHmm> (use today's date/time)
in the project root, and inside it write:

1. progress.md — a Markdown summary covering:
   - What you worked on this session
   - What's done (with file paths / commit references)
   - What's in progress or half-finished
   - What's blocked, and why
   - Any decisions you made and your reasoning
   - Open questions that need Ian's input before continuing

2. progress.json — the same information, structured:
{
  "generated_at": "<ISO 8601 timestamp>",
  "session_summary": "",
  "completed": [{ "task": "", "detail": "", "files_changed": [] }],
  "in_progress": [{ "task": "", "detail": "", "blockers": [] }],
  "blocked": [{ "item": "", "reason": "", "needs_decision_from": "Ian" }],
  "decisions_made": [{ "decision": "", "rationale": "" }],
  "open_questions": [""],
  "files_touched": [""],
  "commands_run": [""]
}

3. Copy in (not just reference) any files you created or modified this
   session that aren't already committed to git — reports, scripts, logs,
   test output.

4. Zip the whole folder:
   zip -r kimi-export-<YYYY-MM-DD-HHmm>.zip kimi-export-<YYYY-MM-DD-HHmm>/

Confirm the zip's full path and size when done.
