# T26 — Field Mapping

Source of truth for `FIELD_MAP`, `DOMAIN_ALIASES`, `COGNITIVE_MAP`, `DIFFICULTY_MAP` in
`scripts/migrate-questions.ts`. Update the script when this document changes.

## Source column → target
| Source column | Target | Transform | If missing |
|---|---|---|---|
| ID / Question ID | `questions.source_id` | as-is | `hash:<sha256 of stem>` |
| Domain | `questions.domain_id` | name → `domains.code` via DOMAIN_ALIASES | **error** |
| Topic | `questions.topic_id` | name → `topics.id`, inserted if new (slug = `<code>-<slug>`) | NULL |
| Question | `questions.body` | NFC-normalised, trimmed | **error** |
| Explanation | `questions.explanation` | as-is | NULL |
| Cognitive Level | `questions.cognitive_level` | COGNITIVE_MAP → knowledge/comprehension/application/analysis | NULL |
| Difficulty | `questions.difficulty` | DIFFICULTY_MAP → easy/medium/hard | NULL |
| Type | `questions.question_type` | "sata"/"select all" → `sata`; else inferred from answer count / stem text | `mcq` |
| Option A–F | `question_options.body` (display_order 1–6) | blank options dropped | **error if < 2** |
| Answer | `question_options.is_correct` | letters (`B`, `A,C`, `BD`), numbers (`2`), or full option text | **error** |
| Tags | `tags` + `question_tags` | split on `, ; \|` | none |

## Domain name → code
| Client's name | Code |
|---|---|
| | MCH |
| | MED |
| | PSYCH |
| | COMM |
| | CRIT |
| | FUND |
| | PHARM |

## Value standardisation
- Cognitive level values seen in source:
- Difficulty values seen in source:

## Unmapped source columns
| Column | Decision |
|---|---|
| | skip / keep in `source` / new column |

## Sign-off
- [ ] Ian reviewed and approved before T28 write run
