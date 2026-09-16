# T27 — Edge Cases

| # | Case | Count in source | Resolution | Script behaviour |
|---|---|---|---|---|
| 1 | SATA questions | | `question_type='sata'`, N correct options | detected from type column, "select all that apply" in stem, or >1 correct letter |
| 2 | Questions with images | | Phase 1: **skip** / placeholder text (decide) | not detected automatically — grep source for `.png/.jpg/[image]` |
| 3 | Missing explanations | | keep, `explanation=NULL`; teachers fill in later | reported as count |
| 4 | Duplicate questions | | first occurrence wins | sha256 of normalised stem → `skipped` |
| 5 | Encoding / curly quotes | | keep as-is (NFC) | NFC normalise, strip NBSP, strip BOM |
| 6 | Unknown domain name | | add alias or fix source | `error`, row not inserted |
| 7 | Answer key doesn't match an option | | fix source | `error` |
| 8 | Fewer than 2 options | | fix source | `error` |

## Agreed exclusions (out of scope for Phase 1)
| source_id | Reason |
|---|---|
| | |

## Sign-off
- [ ] Ian signed off on image strategy before T28
