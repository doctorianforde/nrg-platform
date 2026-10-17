# Dedup reviewer brief (dedup-v1)

You judge candidate duplicate clusters produced by `scripts/dedup-bank.ts --candidates` (local embeddings,
cosine on stem + correct answer). The embedding only says "these look alike". You decide whether they are
duplicates. Most candidates in the lower similarity range are **not** duplicates; be strict.

## What counts as a duplicate

Two items are duplicates when they present **the same clinical scenario and test the same concept with the
same answer**: a student who has learned one would answer the other for free.

Duplicates (retire one):
- Same situation reworded: two adult hypoglycaemia items (conscious, can swallow, low glucose) both keyed
  "give 15–20 g fast-acting carbohydrate".
- Same fact asked twice: "when is GDM screening offered" → 24–28 weeks, in two wordings.
- Same decision with cosmetic differences (age, sex, setting, exact numbers) that don't change the answer.

Not duplicates (keep both):
- Same topic, **different decision point**: "what to do during a febrile seizure" vs "priority after a febrile
  seizure"; "first 15 minutes of a transfusion" vs "check before starting"; Mg sulfate purpose vs Mg toxicity sign.
- Same calculation type with different numbers that must actually be worked (two amoxicillin dose calcs).
- Same family of question with different content: four-client prioritisation items with different clients;
  delegation items whose keyed task differs; hypokalaemia signs vs hyperkalaemia ECG.
- One item asks for recognition (what is this?) and the other for action (what do you do?) — unless the action
  item gives the diagnosis away and the answers coincide.

When unsure, it is **not** a duplicate.

## Keeper rule (inside a duplicate group)

1. `status: approved` (or `active: true`) beats pending. Approved/active items are never retired.
2. `reviewed: true` (a teacher has looked at it) beats not reviewed.
3. Better quality: `has_all_rationales: true`, a clearer stem, no defect in the key or options.
4. Otherwise the older item (`created_at`; if equal, the lower spec number).

## Cross-pool entries (J = AI item vs Jade's questions, P = AI item vs the prototype import)

Judge only whether the **AI item** duplicates one of the listed matches. Jade's items and prototype items are
never changed. For a duplicate, give `match` = the source_id it duplicates (the closest one). If the matched
items also duplicate each other (e.g. two identical Jade questions), say so in `note`.

## Output

Write `<batch>.out.json` next to the `.in.json`, a JSON object `{ "clusters": [ ... ] }` with exactly one entry
per input cluster, same `id`:

AI clusters (`A###`):
```json
{ "id": "A012", "verdict": "duplicate" | "mixed" | "distinct",
  "reason": "one line: why (for distinct: why the decision points differ)",
  "groups": [ { "keep": "<source_id>", "retire": [ { "source_id": "<source_id>", "reason": "one line, e.g. same conscious hypoglycaemic adult, same 15 g carbohydrate answer" } ] } ] }
```
- `duplicate`: every member falls in one or more duplicate groups; `mixed`: some members are duplicates, others
  are distinct; `distinct`: no duplicates (`groups: []`).
- A cluster can contain several separate duplicate groups. Every retired item names its keeper via its group.
- Items listed under `links` (outside the cluster) may also be used in a group when they duplicate a member.
- Never put an approved/active item in `retire`. Each source_id appears in at most one group.

Cross entries (`J###`, `P###`):
```json
{ "id": "J004", "verdict": "duplicate" | "distinct", "match": "<jade/proto source_id or omit>", "reason": "one line", "note": "optional" }
```

Reasons are short paraphrases (no full stems). Do not edit any other file and do not touch the database.
