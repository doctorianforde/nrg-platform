# Generation requests: prompted and automatic modes

Built 2026-10-20 (Claude). Framework and teacher UI done on staging: **Teacher → Generate content** (`/teacher/generate`).

Jade asks for new content one of two ways, for every generator (stand-alone MCQs and unfolding case studies today;
new generators plug in the same way):

| Mode | Jade does | The system does |
|---|---|---|
| **Automatic** | Picks the selections: domain, cluster, topic, taxonomy, difficulty (cases: specialty, condition, population, setting, difficulty, primary and Q7/Q8 domains), and a count. Leaves any axis empty to get the RENR blueprint mix. | Plans exact per-axis counts and runs the generator. |
| **Prompted** | Writes what he wants: *"15 hard analysis questions on postpartum haemorrhage"*. | Interprets the prompt into the same selections, shows them with anything it won't do, and waits for Jade's OK. His words also go to the author as guidance. |

Both modes compile to **the same request and the same plan**, so the MCQ standard, the case standard, scope limits
and mg/dL glucose apply exactly as before. A prompt can steer content but can't switch a rule off. The authoring
prompt says the standard wins, and the interpreter lists conflicts (critical care, advanced practice, SATA, mmol/L
glucose, images, all/none of the above) instead of quietly honouring them. Output still lands as pending review.

## Pieces

| File | What it is |
|---|---|
| `src/lib/generation/taxonomy.ts` | The fixed axes: 7 domains, 3 taxonomy levels, 5 clusters, 5 case specialties, difficulty scales, generator kinds. (Topics, ~1,220, are in the `topics` table.) |
| `src/lib/generation/request.ts` | `GenerationRequest` type, `validateRequest()`, `readyToRun()`, `describeRequest()` (the confirmation text). |
| `src/lib/generation/plan.ts` | `buildMcqPlan()`: largest-remainder counts + even interleave per axis; topics spread evenly and each item takes its topic's cluster. Moved from `generate-questions.ts`; with no request its output is byte-identical to before (checked at 10/37/100 items and with a mock run). |
| `src/lib/generation/interpret.ts` | `heuristicInterpret()` (offline keyword matcher, instant), `interpretSystemPrompt()` + `parseInterpretation()` (model or agent), `matchTopics()` / `resolveTopicPhrases()` against the topic list, `applyInterpretation()`. |
| `scripts/generation-request.ts` | CLI: `new`, `show`, `interpret`, `confirm`, `run`, plus queue `submit` / `queue` / `pull` / `finish`. |
| `scripts/generate-questions.ts --request` | MCQ generator reads a request: topic and difficulty per spec, Jade's prompt in a "TEACHER'S REQUEST" block placed *before* the standard and subordinate to it. |
| `scripts/plan-cases.ts --request` | Case planner reads a request: named conditions first (catalog or free text), specialty / difficulty / domains constrained, `teacher_request` on every CASE_REQUEST (see `CASE_GEN_BRIEF.md`). |
| `supabase/migrations/20261020120000_generation_requests.sql` | Queue table. **Staging only** (applied 2026-10-20); not needed on prod until the UI ships. |
| `scripts/test-generation-requests.ts` | 49 offline checks: validation, planning, both interpreters, CLI end to end via the mock provider. |

### Request JSON

```json
{
  "kind": "mcq",
  "mode": "prompted",
  "count": 15,
  "title": "PPH set",
  "prompt": "15 hard analysis questions on postpartum haemorrhage",
  "selections": {
    "domains": ["CDM", "NP"],
    "taxonomy": { "ASE": 70, "AP": 30 },
    "topics": [{ "id": 812, "name": "Obstetric emergencies — postpartum haemorrhage", "cluster": "MATCHILD" }],
    "difficulty": ["hard"]
  },
  "interpretation": { "by": "heuristic", "at": "…", "notes": [], "conflicts": [], "unresolved": [], "confirmed": true }
}
```

Each axis takes a **list** (split evenly) or a **{code: percent}** record (must sum to 100). An unset axis uses the
blueprint. Difficulty is ignored while `generation-rules.json` has `drop_difficulty` on (Jade's "taxonomy rather than
difficulty" note is still open). Case selections: `specialties`, `conditions`, `population`, `setting`,
`difficulty` (low/moderate/high), `primary_domains`, `extension_domains`.

### Interpreters

- **heuristic** (default): no API, no cost; reads count, domains, taxonomy words, difficulty, clusters/specialties,
  catalog conditions, and topics by whole-word match against the live topic list (most specific reading per phrase).
- **anthropic / kimi**: one small model call (needs an API key in `.env.local`).
- **agent**: writes `<req>.interpret.md` for a Claude Code / Kimi session (subscriptions, no API key); the session
  saves its JSON and you rerun with `--interpretation`.

Model and agent replies are validated code by code; topic phrases that match nothing are kept as guidance and listed.

## Using it today (CLI)

```bash
G="npx tsx scripts/generation-request.ts"
# prompted
$G new --kind mcq --mode prompted --prompt "15 hard analysis questions on postpartum haemorrhage" --out req.json
$G interpret req.json            # shows the selections + plan; edit req.json if anything is off
$G confirm req.json
$G run req.json -- --prompt-out data/generated/pph.brief.md     # agent mode, then --provider file --input …
# automatic
$G new --kind mcq --mode auto --count 20 --domains NLM,PC --taxonomy ASE --topics "Delegation;Ethics" --out req2.json
$G new --kind case_study --mode auto --count 2 --specialties OB --conditions "Pre-eclampsia" --extension-domains NLM,COM --out cases.json
$G run cases.json                # writes the CASE_REQUEST plan; generator agents follow CASE_GEN_BRIEF.md
```

## Queue: `generation_requests` (staging)

`status`: draft → awaiting_confirmation (prompted, not yet accepted) → queued → running → done | failed; cancelled
before running. RLS (verified 2026-10-20, 13 checks): teaching staff read all and create/edit **their own** until it
runs; they can't set running/done or write `result`/`error`; no delete; students and anon get nothing; `kind`/`mode`
must match the JSON. The runner uses the service role: `queue` → `pull <id>` (marks running) → `run` → `finish <id>`.
One test row (`QUEUE TEST: …`, status done) is still on staging; the clean-up delete was declined in-session.

## Teacher UI: `/teacher/generate` (built 2026-10-20, after the redesign)

Staff only (`requireRole("teacher")`); linked from the teacher dashboard's quick links. It isn't in the header nav, which
the redesign had just fitted onto one line.

- **What / how:** *Questions / Case studies*, then *Describe it / Choose it*.
- **Describe it:** a textarea, with a live "What I can read so far" panel (`heuristicInterpret()` against the full topic
  list), conflicts in red, unresolved phrases in grey. *Check what I asked for* copies the reading into the same controls as
  *Choose it*, where Jade edits anything (his edits win); the count comes from the prompt.
- **Choose it:** count and name; chips for domains / taxonomy / clusters / difficulty (difficulty hidden while
  `drop_difficulty` is on); topic search over all active topics (chips, each takes its topic's cluster); "leave out";
  an optional note to the writer (stored as `prompt`, always visible, so no hidden text is ever sent). Cases: specialty,
  condition (catalog list or new free text, marked "(new)"), patient, setting, difficulty, primary and Q7–Q8 domains.
- **Summary:** `describeRequest()` lines plus the per-axis plan from `buildMcqPlan()`; *Queue it* is disabled until the
  request is valid. Pressing it is the confirmation: the server action re-validates with `validateRequest()`, marks a
  prompted interpretation confirmed, and inserts with the teacher's own token (RLS). The form resets afterwards.
- **Requests sidebar:** the latest 30, with status (Queued / Writing / Ready for review / Failed / Cancelled), who asked,
  and *Cancel* on your own rows before they run. A finished MCQ request links to `/teacher/review?run=<run_id>` (new
  `run` filter on the review queue: `source_id` starts `ai:<run_id>:`); a finished case request links to case studies.
- **Who runs it:** unchanged. An agent session or the CLI runs `queue` → `pull` → `run` → `finish`. The CLI's network
  calls fail now and then on this machine ("fetch failed"); rerun the command. Rerunning `pull` after a lost reply can
  find the row already `running`; check `queue` before pulling again.

Verified 2026-10-20 against staging (local dev server with staging env, Playwright, 21 checks): live preview; topic
match; conflict shown; count prefilled; edits reflected in the summary; queue + flash + sidebar; form reset; topic
search; case free-text condition; disabled without a count; cancel; no overflow at 390 px; dashboard link; student
turned away. Stored rows checked in the database. A UI-created request then went through `pull` → mock `run` → `finish`.
All test rows are cancelled; the two `done` rows are the CLI queue test and that run.

Prod: apply `20261020120000_generation_requests.sql` before this code reaches `main` (the page and the dashboard link
expect the table).
