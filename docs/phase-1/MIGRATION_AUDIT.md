# T25 — Migration Audit (question content from client)

Status: **awaiting source files from Jade Nicome** (requested DATE).

## Files received
| File | Format | Rows | Received | Notes |
|---|---|---|---|---|
| | | | | |

## Quick audit (run per file)
```
npx tsx scripts/migrate-questions.ts --file data/<file> --offline
```
Paste the "Column mapping" and "Validation" output here. Any `Required columns not found`
means FIELD_MAP in the script needs the client's column names added (T26).

## Totals
- Total questions found:
- Practice vs mock exam (client claims ~6,100 + ~4,000):
- By domain:
- MCQ / SATA split:
- Rows missing explanation:
- Duplicate stems (script reports as `skipped`):

## Fields present in source
(list every column; mark which map to schema and which are unmapped)

## Data quality notes
- Encoding issues:
- Image references:
- Unknown domain names:

## Sign-off
- [ ] Ian confirmed total count with client before T26
