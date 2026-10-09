# Prod port runbook: reviewed AI bank (MCQ standard v0.1)

Status: **ready, pending Ian's review.** Nothing in this runbook has been run against prod.

## What goes to prod

| Pool | On prod today | This port |
|---|---|---|
| AI bank (`ai:*`), 2,000 | Original versions, all inactive and pending | **1,991 rewrites** (new stem, options, typed options, a rationale per option; negative-stem items in the new format; 7 keys changed in the 2026-10-09 fix pass, see data/review/fix/JADE_CHECKLIST.md) + **9 retirements** (duplicates, set to `rejected`) |
| Prototype bank (`proto:*`), 4,798 | Not on prod | Not part of this port (separate import decision) |
| Jade's questions (`jade:*`) | 460 live | **Nothing.** His 461 revisions are proposals awaiting his sign-off. 6 miskeyed soft-launch items are already deactivated (Ian's instruction, 2026-10-05) |

Nothing becomes active. Ported AI questions stay `is_active = false`, `review_status = pending` until a teacher approves them in `/teacher/review`.

## Before you start

1. Read `data/review/NRG_Bank_Review_Report.pdf` (random before/after sample and flag register) and decide the port is acceptable.
2. Negative stems are handled (option 1, 2026-10-08). Numeric dose-calculation items are still a policy question; the ones that were flagged stay flagged.

> **Deploy order matters (2026-10-09).** The app code on `main` from commit "case study platform" onward reads
> `questions.context` (practice, review queue, mock-exam builder) and the case-study tables. Apply every migration below to
> prod **before** pushing that code, or those pages fail on the live site.

## Steps

1. **Apply the migrations to prod** (staging already has all three). Follow CLAUDE.md "Connecting the Supabase CLI" and push through the pooler:
   - `20261004181457_add_question_options_distractor_type`: adds the colour column.
   - `20261004194204_backup_ai_option_rationales_20261004`: snapshots prod's current AI rationales.
   - `20261009000911_distractor_type_not_asked`: adds the `not_asked` type used by negative-stem questions.
   - `20261009003423_case_study_platform`: `questions.context`, the `unsafe` option type, case stages, attempts and the case RPCs.
2. **Regenerate the port SQL** from the current staging state, with a dry run on staging (it rolls back):
   ```bash
   npx tsx scripts/port-review-to-prod.ts --out data/review/prod-port/ai-port.sql --test-on-staging
   ```
   Expected: `{"kind":"retire","n":1,"c":9}, {"kind":"rewrite","n":14,"c":1991}`.
3. **Apply to prod** (one transaction; it snapshots every `ai:*` question and option first):
   ```bash
   read -s SUPABASE_DB_PASSWORD; export SUPABASE_DB_PASSWORD     # prod password, never pasted into chat
   CONFIRM_PROD=yes npx tsx scripts/port-review-to-prod.ts --apply-prod data/review/prod-port/ai-port.sql
   ```
   The same counts should print. A `rewrite` row with `n = 0` means a guard skipped that question: it was live, approved, or no longer had 4 options. Look at those by hand.
4. **Verify on prod (read-only):** 1,991 AI questions with four typed options, glucose in mg/dL, `is_active` unchanged.

## Rollback

The port is one transaction, so a failure leaves prod unchanged. To undo a completed port, restore from `_backup_prod_port_questions_20261005` / `_backup_prod_port_options_20261005` (full copies of every `ai:*` row taken at the start of the port). Drop the backup tables once the content is accepted.

## Afterwards

- The colour-coded rationale view still needs building in the app (`distractor_type` in `src/lib/supabase/types.ts` plus a rationale component). Until then the colour data sits unused.
- Turn on `store_option_types` in `scripts/generation-rules.json` once prod has the column, so new generated questions keep their types.
