# Trophies, badges and celebrations: plan

Status: **plan only (2026-10-13)**, nothing built. Ian's decisions recorded below (2026-10-13). Requested by Jade: a trophy system with badges and animations for major
accomplishments and for every rank after the first. Builds on ranking v2 (promotion quiz, streak, topic mastery), which is
on staging and not yet on prod.

## In one paragraph
Students earn a **badge** for each promotion (24, Novice II → Expert V) and for a short list of **major accomplishments**
(about 20: streaks, mastery, mock exams, case studies, contributions). Badges are awarded by the database at the moment the
accomplishment happens, from data the platform already records. Each new badge plays a celebration the next time the
student is on screen: a **full ceremony** for promotions and tier trophies, a **reveal card** for major accomplishments, a
**toast** for smaller ones. Earned and locked badges live in a **trophy case** on the profile. No new data has to be
collected; nothing here changes XP unless Jade wants it to.

## What earns a badge

### Rank badges (24): one per promotion after the first rank
Earned only by **passing the promotion quiz** for that level (ranking v2). Each badge shows the tier colour from the ladder
(Novice grey, Advanced Beginner blue, Competent green, Proficient purple, Expert amber) and the level's numeral.

| Levels | Badge | Celebration |
|---|---|---|
| Novice II – V (1–4) | Rank badge | Rank-up ceremony |
| **Advanced Beginner I (5)** | Rank badge + **tier trophy** "Advanced Beginner" | Ceremony, trophy variant |
| Advanced Beginner II – V (6–9) | Rank badge | Ceremony |
| **Competent I (10)** | Rank badge + **tier trophy** "Competent Candidate" | Ceremony, trophy variant |
| Competent II – V (11–14) | Rank badge | Ceremony |
| **Proficient I (15)** | Rank badge + **tier trophy** "Proficient Candidate" | Ceremony, trophy variant |
| Proficient II – V (16–19) | Rank badge | Ceremony |
| **Expert I (20)** | Rank badge + **tier trophy** "Expert Candidate" | Ceremony, trophy variant |
| Expert II – IV (21–23) | Rank badge | Ceremony |
| **Expert V (24)** | Rank badge + **summit trophy** "Ready for Registration" | Biggest ceremony |

Novice I (level 0) has no badge: everyone starts there.

### Major accomplishments (proposed list for Jade to edit)
"Major" ones get the reveal card; the rest a toast. Counts use answers recorded in `question_attempts` (all sources).

| Area | Badge | Earned when | Weight |
|---|---|---|---|
| Streak | On a Roll · Committed · Unstoppable | 7 · 30 · 100 days in a row with 10+ questions (Trinidad days) | toast · major · major |
| Mastery | Turned It Around | A topic goes from Weak to Mastered (same moment as the 200 XP milestone) | major |
| Mastery | Domain Mastered (×7, one per RENR domain) | A domain first reaches Mastered | toast |
| Mastery | Blueprint Master | All seven domains Mastered at the same time | major |
| Volume | First Steps · Century · Thousand Strong · Five Thousand | 1 · 100 · 1,000 · 5,000 questions answered | toast · toast · major · major |
| Mock exams | First Paper · Pass Mark · Distinction | First mock completed · 66%+ on a mock · 80%+ on a mock | toast · major · major |
| Mock exams | Team Player | Completed a group mock exam | toast |
| Promotion | Flawless | 25/25 on a promotion quiz | major |
| Promotion | First Time | Passed a promotion quiz on the first try | toast |
| Case studies | Case Opened · Clinical Judgement | First case completed · all six clinical-judgement questions right in one case | toast · major |
| Case studies | Caseload | 10 cases completed | major |
| Contribution | Author · Prolific Author | 1 · 10 student-written questions approved | major · major |

Rules that keep badges meaningful: each badge is earned **once** per student; staff never earn badges; nothing is
awarded for logging in or for time spent.

## How it works

### Data (staging first, one migration)
- `badge_definitions`: `code`, `name`, `description`, `category`, `weight` (`toast` | `major` | `ceremony`), `tier`
  (for rank badges), `criteria` (type + parameters, e.g. `{"type":"streak","days":30}`), `art` key, `sort_order`,
  `is_active`. Jade edits names, descriptions and the list; criteria types are code.
- `user_badges`: `user_id`, `badge_code`, `earned_at`, `context` (e.g. the promotion attempt or mock session),
  `seen_at` (NULL until its celebration has played). Unique on (`user_id`, `badge_code`). RLS: students read their own;
  staff read all; no direct writes.

### Awarding (database, idempotent)
One function `award_badges(user, event)` checks only the badges an event can affect, and inserts with
`ON CONFLICT DO NOTHING`, so retries and double calls can never duplicate a badge. It is called from the places that
already run when something happens:

| Event | Already handled by | Badges it checks |
|---|---|---|
| Practice answers recorded | `record_practice_answers` → `apply_answer_bonuses` | volume, streak, mastery |
| Mock completed | `complete_mock_exam_session` | mock badges, volume, streak, mastery, team |
| Promotion quiz finished | `_promotion_settle` | rank badge, tier/summit trophy, Flawless, First Time |
| Case completed | `answer_case_question` (last question) | case badges |
| Student question approved | the existing approval trigger | Author badges |

Because awards are tied to the moment, not recomputed later, a badge stays earned even if a streak later breaks.

### Celebrations (front end)
- On every student page load, the app asks for badges with `seen_at IS NULL` (one cheap query) and plays them, biggest
  first, then marks them seen. A badge earned mid-quiz plays on the result screen; one earned in practice plays at the
  end of the session.
- **Rank-up ceremony** (promotions): full-screen overlay, the old rank badge flips to the new one in its tier colour,
  a short burst of confetti, the new rank name and the next goal. Tier and summit trophies add a trophy rise and a
  longer burst. About 3 seconds, skippable.
- **Reveal card** (major accomplishments): centred card, badge scales in with a shine sweep, one-line description.
- **Toast** (smaller badges): slides in at the corner for 4 seconds.
- Built with CSS animations plus a small confetti routine (canvas, no new heavy dependency). `prefers-reduced-motion`
  turns every animation into a simple fade. Optional sound using the existing `/sounds` pattern, off by default.

### Screens
- **Trophy case** on `/study/profile` (latest 4 badges under the rank card, "See all") and a full `/study/trophies`
  page: rank badges as a 24-step ladder, accomplishments grouped by area. Earned badges in colour with the date;
  locked ones as grey silhouettes with how to earn them (secret badges, if Jade wants any, show "???").
- **Teachers** see a student's badges on the student's profile view (encouragement, not ranking).
- **Classmates** (Ian, 2026-10-13: badges are visible to classmates) see a student's badges, unless that student turns off
  **"Show my badges to classmates"** on their profile (on by default; `profiles.show_badges`, mirroring the privacy toggles in
  Jade's prototype). Where classmates see them:
  - a small profile card when a classmate's name is clicked (name, rank badge, latest badges);
  - next to names in group-exam standings;
  - a **"Recent achievements"** wall on `/study/trophies` showing badges classmates earned in the last 7 days.
  RLS: a student reads another student's `user_badges` only when that student's `show_badges` is true. Badges never reveal
  XP, scores or topic states. A leaderboard stays out of scope until Jade asks for one.
- Nothing about multipliers or topic states, in line with Jade's rank-only rule for students.

### Art
Ian, 2026-10-13: Ian generates the art with an image AI from prompts: `docs/phase-1/BADGE_ART_PROMPTS.md` (37 images: 5 tier
medals, 4 tier trophies, 1 summit trophy, 27 accomplishment badges, all with no text). The app overlays the level numeral and
the badge name, so the 24 rank badges come from the 5 medals, and it makes the grey "locked" versions itself. Until the images
arrive the build uses simple placeholder medals, so nothing waits on the art.

## Fit with ranking v2 and go-live
- Rank badges depend on the promotion quiz, so they go live with ranking v2. Under Ian's rule that everyone restarts at
  level 0, nobody holds a rank badge on day one; they are earned from the first promotions.
- Accomplishment badges can launch with or before ranking v2. A one-off **backfill** at launch could award what students
  have already done (mocks passed, questions approved, cases completed); practice volume and streak only count from the
  day `question_attempts` reaches prod.
- Everything sits behind `NEXT_PUBLIC_RANKING_V2` (or a separate `NEXT_PUBLIC_TROPHIES` flag) and goes to staging first.

## Build phases (each ends with a check on staging)
1. **Data and awarding**: migration, the badge catalogue as seed data, `award_badges` wired into the five events, tests
   that each badge fires once and only when earned (including the farming cases: repeat attempts, staff accounts).
2. **Celebrations**: the three animation levels, unseen-badge queue, reduced-motion behaviour.
3. **Trophy case**: profile strip, `/study/trophies`, teacher view.
4. **Backfill and launch**: optional backfill script (dry run first), prod migration with the ranking v2 go-live.

## Decisions needed
| Decision | Proposal | Owner |
|---|---|---|
| The accomplishment list, names and thresholds | The table above as a starting point | Jade (open) |
| Do badges give XP? | **Decided (Ian): no XP.** XP stays tied to study, so badges can't be farmed for rank | done |
| Who sees a student's badges? | **Decided (Ian): classmates too**, with a "Show my badges to classmates" toggle, on by default | done; Jade to confirm the default |
| Art | **Decided (Ian): image AI from the prompts in `BADGE_ART_PROMPTS.md`**; placeholders until then | Ian generates the 37 images |
| Backfill past accomplishments at launch? | **Decided (Ian): yes, where data exists** (mocks, approved questions, cases); volume and streaks count from launch | done |
| Sound on unlock | Off by default, student can turn it on | Jade (open) |
| Secret badges? | None at first | Jade (open) |
