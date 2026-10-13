# Badge art: image-generation prompts

For Ian to take to an image-generation AI (Midjourney, DALL·E, Ideogram, Firefly, etc.). Plan: `TROPHY_PLAN.md`.

## How to use these
1. **Generate with no text.** Image AIs misspell words and numerals, so every prompt asks for none. The app draws the level
   numeral (II, III, …) and the badge name on top of the art. That is why the 24 rank badges need only **5 medal designs**,
   one per tier.
2. **Paste the style block** at the end of every prompt, word for word, so the whole set matches. If your tool supports a
   style or character reference, generate the first medal (N-1) until you like it, then use it as the reference for the rest.
3. **Output:** square 1:1, at least 1024 × 1024 px, PNG on a **flat pure white background** (the style block asks for it).
   I remove the white and make the transparent versions; you don't need to cut anything out.
4. **Check at small size:** each badge must still read clearly at 64 px wide, roughly the size it appears in the trophy case.
5. **Name the files** exactly as listed (e.g. `rank-novice.png`) and drop them in the repo's `trophy/` folder. I remove the
   white with `scripts/badge-cutout.py`, put them in `public/badges/`, and make the grey "locked" versions in code.
6. **Keep the set matching:** for the other four medals, stay in the same Gemini chat as the first medal and ask for
   "the same medal, same shape and lamp, but with a clear blue enamel face and a polished bronze rim" (and so on per tier),
   rather than starting a new chat. Do the same for the trophies and for the accomplishment shields.

**Progress (2026-10-13):** all 5 rank medals done and in `public/badges/` (the full 24-badge ladder, numerals by the app); still to make: 5 trophies and 27 accomplishment shields. Originals stay in `trophy/` on Ian's machine (git-ignored).

**First result (2026-10-13):** `rank-novice` from Nano Banana passed every check: clean white background removal, the
numeral overlay fits the empty centre, readable at 64 px, no fringe on dark or purple.

### Style block (append to every prompt)
> Polished game achievement badge, semi-flat vector illustration style with soft gradients and a gentle top-left highlight,
> a crisp dark outline around the entire outer edge of the badge, isolated and centred on a solid flat pure white background
> (#FFFFFF) with nothing else in the scene, wide empty white margin on all sides, no drop shadow, no cast shadow, no glow,
> no sparkles, no floor or surface, no vignette, no gradient in the background, no checkerboard pattern, front view,
> symmetrical, no text, no letters, no numbers, no watermark, no signature, high contrast, readable at small sizes, square 1:1.

**Why it's written this way (Nano Banana / Gemini and similar tools):** these tools can't output a truly transparent
background, and asking for one often produces a fake grey-and-white checkerboard painted into the image. A flat pure white
background with a dark outline round the badge, and nothing (shadow, glow, sparkles) bleeding into the white, lets the
background be removed cleanly afterwards. Glows and sparkles are added by the app instead, where they can also animate.
If a result comes back with a shadow, a tinted background or a checkerboard, regenerate it or say "same badge, background
pure flat white, remove the shadow".

### Colours (keep to these)
| Tier / use | Colour | Hex |
|---|---|---|
| Novice | cool pewter grey | #8B95A5 |
| Advanced Beginner | clear blue | #3B82F6 |
| Competent Candidate | emerald green | #16A34A |
| Proficient Candidate | royal purple | #6B2D8B (NRG brand purple) |
| Expert Candidate | warm gold | #F2B705 |
| Accomplishment frames | NRG purple with gold trim | #6B2D8B, #F2B705 |

Motifs: the **nursing lamp** (Florence Nightingale's lamp of care) is the recurring emblem. Use the **Rod of Asclepius**
(one snake, one staff) if a medical symbol is wanted, never the caduceus (two snakes, wings).

---

## 1. Rank medals (5 images; the app adds the numeral II–V or I–V)
Each is the same medal shape so the ladder looks like one set; only the colour and the metal change as students climb.

| File | Prompt (then add the style block) |
|---|---|
| `rank-novice.png` | A round medal with a cool pewter-grey enamel face set in a plain brushed pewter rim, a small embossed nursing lamp at the top of the rim, a smooth empty circular centre left blank for a numeral, two short pewter-grey ribbon tails hanging below. Modest and simple. |
| `rank-advanced-beginner.png` | The same round medal design with a clear blue enamel face set in a polished bronze rim, a small embossed nursing lamp at the top of the rim, a smooth empty circular centre left blank for a numeral, two short blue ribbon tails below. |
| `rank-competent.png` | The same round medal design with an emerald green enamel face set in a polished silver rim with a fine beaded edge, a small embossed nursing lamp at the top of the rim, a smooth empty circular centre left blank for a numeral, two green ribbon tails below, a soft shine across the enamel face. |
| `rank-proficient.png` | The same round medal design with a royal purple enamel face set in a bright silver rim with small laurel leaves engraved around the edge, a small embossed nursing lamp at the top, a smooth empty circular centre left blank for a numeral, two purple ribbon tails below. |
| `rank-expert.png` | The same round medal design with a warm gold enamel face set in an ornate polished gold rim with engraved laurel leaves and four tiny inset gemstones, a small embossed nursing lamp at the top, a smooth empty circular centre left blank for a numeral, two gold ribbon tails below. |

## 2. Tier trophies (4) and the summit trophy (1)
| File | Prompt (then add the style block) |
|---|---|
| `trophy-advanced-beginner.png` | A small trophy cup in polished bronze with clear blue enamel bands, two curved handles, a nursing lamp emblem on the front of the cup, standing on a short dark plinth. |
| `trophy-competent.png` | A trophy cup in polished silver with emerald green enamel bands, two curved handles, a nursing lamp emblem on the front, a laurel wreath wrapped around the stem, standing on a stepped dark plinth. |
| `trophy-proficient.png` | A tall trophy cup in bright silver with royal purple enamel bands, elegant curved handles, a nursing lamp emblem on the front, a laurel wreath around the stem, on a stepped plinth with a purple band. |
| `trophy-expert.png` | A grand trophy cup in polished gold with warm gold enamel, ornate curved handles, a nursing lamp emblem on the front, a full laurel wreath around the stem, on a tall stepped plinth with gold trim. |
| `trophy-summit.png` | A majestic gold trophy topped with a lit nursing lamp with a bright golden flame (kept inside the badge outline), a Rod of Asclepius engraved on the front, a full laurel wreath, a deep purple ribbon draped across the base, standing on a grand stepped plinth. The finest and most impressive badge in the set. |

## 3. Accomplishment badges (27)
All use the same frame: **a rounded shield with a deep purple (#6B2D8B) face and a gold trim**, the icon in the centre.
Where a badge has levels (bronze, silver, gold), change only the trim metal.

Start each prompt with: *"A rounded shield badge with a deep purple face and a [bronze / silver / gold] trim, showing in the
centre:"* then the icon below, then the style block.

| File | Trim | Centre icon |
|---|---|---|
| `streak-7.png` | bronze | a single bright orange flame |
| `streak-30.png` | silver | a tall orange and yellow flame with a small spark above it |
| `streak-100.png` | gold | a large blazing flame in orange, yellow and white, wrapped by a small laurel wreath |
| `turned-it-around.png` | gold | an arrow that starts low in red on the left and curves up sharply into green on the right, a small heartbeat line running through it |
| `domain-np.png` | silver | a stethoscope curled in a circle |
| `domain-cdm.png` | silver | a brain with a small green checkmark beside it |
| `domain-nlm.png` | silver | a clipboard with three small figures above it, one slightly in front |
| `domain-pc.png` | silver | a balanced pair of scales with a small heart on the centre post |
| `domain-hpmw.png` | silver | a heart with a fresh green leaf growing from its top |
| `domain-com.png` | silver | two overlapping speech bubbles, one purple and one white |
| `domain-pd.png` | silver | an open book with a graduation cap resting on top |
| `blueprint-master.png` | gold | a seven-pointed star, each point set with a different small coloured gem, a bright centre |
| `first-steps.png` | bronze | a single footprint at the start of a winding path |
| `century.png` | bronze | a neat stack of flash cards with a small star on the top card |
| `thousand-strong.png` | silver | a mountain with a path climbing to a flag near the top |
| `five-thousand.png` | gold | a mountain peak with a planted flag at the summit and a sunrise behind |
| `first-paper.png` | bronze | an exam paper with a pencil lying across it |
| `pass-mark.png` | silver | an exam paper with a large green checkmark seal on it |
| `distinction.png` | gold | an exam paper with a gold star rosette ribbon pinned to it |
| `team-player.png` | bronze | three simple figures standing side by side with linked arms |
| `flawless.png` | gold | a brilliant cut diamond with bright facets |
| `first-time.png` | silver | an arrow striking the centre of a target |
| `case-opened.png` | bronze | an open patient folder with a small heartbeat line on the first page |
| `clinical-judgement.png` | gold | a ring divided into six bright segments around a small heartbeat line |
| `caseload.png` | silver | a neat stack of patient folders with a heartbeat line on the top one |
| `author.png` | silver | a quill pen writing a question mark |
| `prolific-author.png` | gold | a quill pen standing in an inkwell beside a stack of books |

(The domain badges are the seven RENR domains: NP Nursing Practice, CDM Clinical Decision Making, NLM Leadership and
Management, PC Professional Conduct, HPMW Health Promotion, COM Communication, PD Professional Development.)

## Checklist when the images come back
- [ ] All 37 files present (5 rank medals, 5 trophies, 27 accomplishments), named as above.
- [ ] Flat pure white background with no shadow, glow, checkerboard or tint; no text or numbers anywhere in the image.
- [ ] The five rank medals share one shape; only colour and rim change.
- [ ] Every badge readable at 64 px.
