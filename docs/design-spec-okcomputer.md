# NRG Design Spec — rebuilt from OKComputer_NRG_Website_v62

Compiled Vite/React SPA (React Router v7, Tailwind, lucide icons, Recharts). Domain:
Caribbean nursing students preparing for the RENR exam. Reference only — no code port.
This spec was produced from live screenshots (Chrome, 1280×800) of all 11 routes plus
interaction flows, supplemented by bundle micro-copy and the compiled CSS.

Prototype routes: `/`, `/login`, `/study-lobby`, `/question-bank`, `/quiz-session`,
`/case-studies`, `/mock-exam`, `/analytics`, `/question-generation`, `/rank-system`,
`/instructor`. No auth gating in the prototype. No settings/profile pages.

## Design tokens (from compiled CSS)

- **Primary purple:** `#6B2D8B` (buttons, active states, accents). Darker: `#5a2475`,
  footer/hero dark `#2D1B4E`.
- **Radius:** `--radius: .625rem` (10px). Cards `rounded-xl`–`rounded-2xl`, buttons
  `rounded-lg`–`rounded-xl`, `rounded-full` pills for filters/badges.
- **Custom utilities:** `.nrg-container` (max-w-7xl centered), `.nrg-section`
  (py-16 md:py-24), `.nrg-card` (white, `border-purple-100` ≈ `#f3e8ff`, `shadow-sm`),
  `.nrg-card-hover` (0.3s transitions), `.nrg-btn-primary` (solid purple, white text,
  px-6 py-3, hover darkens), `.nrg-btn-outline` (2px purple border, purple text).
- **Fonts:** Poppins = headings, Inter = body, Nunito Sans = accents/italic quotes.
  (Our tailwind.config.ts already maps: font-heading=Poppins, font-sans=Inter,
  font-brand=Nunito Sans.)
- **Status colors:** green = correct/strong/live, amber = moderate/warning,
  red = wrong/weak.
- Loading fallback: full-screen gray-50, purple spinner ring.

## Shared chrome

**Navbar:** sticky, `bg-white/95 backdrop-blur`, bottom border `border-purple-100
shadow-sm`, h-16. Left: logo (`/images/nrg-logo.png`, h-10–12). Center (lg+): nav links
with icon + label, `px-3 py-2 rounded-lg text-sm font-medium`; active = `bg-purple-50
text-[#6B2D8B]`, inactive = `text-gray-600 hover:text-[#6B2D8B] hover:bg-purple-50/50`.
Right: Study Lobby link + "Sign In" primary button. Mobile hamburger menu.

**Footer** (`#2D1B4E` dark purple, white text): 4 columns — (1) inverted logo +
tagline "Nursing Review and Examination Guide — helping Caribbean nursing students
master the RENR through active learning.", support email, "Caribbean Region";
(2) Quick Links; (3) Resources (Student Portal → /login, Instructor Portal →
/instructor); (4) About + italic quote "Active learning is the key to nursing
excellence." Bottom bar: © year + "Made with ❤ for Caribbean nursing students".
Link color `text-purple-200 hover:text-white`.

**Page header pattern (most pages):** full-width purple gradient banner with eyebrow
(small icon + label, e.g. "Instructor Portal", "Performance Insights"), large white
bold heading, gray-100 subtitle sentence; right-aligned stats on some pages.
Instructor variant uses a darker purple (`#2D1B4E`-leaning).

**Floating widget (home only):** NursingKnowledgeBlock — fixed bottom-right, 320px,
gradient purple card (`from-[#6B2D8B] to-[#5a2475]`, shadow-2xl, rounded-xl), header
"Nursing Knowledge" + close X, category pill (e.g. green "VITAL SIGNS"), card front
("Normal adult vitals you must know"), footer "Learn more" + "Next ›". Flip-on-click
detail cards (Lab Values, Mnemonics, Safety, Vital Signs, A&P, Signs & Symptoms).

---

## 1. Home / Landing (`/`)

**Hero:** full-bleed purple gradient. Left: pill badge with sparkles icon "Active
Learning for Caribbean Nurses"; H1 "Master Your **RENR** Examination" (white, RENR
emphasized); paragraph "The complete active learning platform for Caribbean nursing
students. Question banks, AI-powered analytics, visual topic reviews, and collaborative
mock exams." Two CTAs: white "Start Learning" + outlined "Try Mock Exam". Social proof:
"⭐ 4.9/5 Student Rating", "500+ Active Students". Right: illustration of nursing
students studying, two floating white stat cards: "Pass Rate **94%**" (top-right) and
"Average Improvement **+32%**" (bottom-left, overlapping). Below hero: stats band
(50+ Topics, 1400+ Questions, 7 Domains).

**"Everything You Need to Pass RENR"** — centered H2 with "Pass RENR" in purple;
3×2 grid of feature cards: purple icon in tile, heading, 2-line description, "Explore ›":
Question Banks, Mock Exams, Clinical Case Studies, Analytics, Question Generation,
Study Lobby.

**"Built Around the 7 RENR Domains"** — two-column: left lists domains, each row:
purple 2-letter badge in rounded square (NP/CDM/NLM/PC/HPMW/COM/PD), domain name,
weight % right-aligned, thin progress bar, small gray descriptor. Weights: Nursing
Practice 30%, Clinical Decision Making 20%, Leadership & Management 15%,
Professional Conduct 10%, Health Promotion & Maintenance 10%, Communication 10%?,
Professional Development 5%. Right: illustration above a "Cognitive Taxonomy
Weighting" card: Application 50% ("What should the nurse do first/best/next"),
Analysis/Synthesis/Evaluation 30%, Knowledge/Comprehension 20%, each with progress bar.

**"Your Active Learning Journey"** — 4-step horizontal stepper (01–04, large faded
purple numerals, icon, title, description, chevron between): Review Topics → Answer
Questions → Generate Questions → Analyze (04 partially obscured in prototype).

**"Why Active Learning Works"** — purple section: left text + 3 stacked translucent
purple benefit rows (Higher Retention / Better Exam Performance "score 25% higher on
average" / Metacognitive Awareness); right illustration with "Student Tip" white quote
card: "The best way to learn is to teach — and creating questions is teaching
yourself."

**Testimonials** — 3 white cards: quote, name, role ("Sarah-Marie Johnson — RENR
Candidate 2025", "David Williams — Registered Nurse, Jamaica", "Keisha Thompson —
Nursing Student, Trinidad").

**"Choose Your Plan"** — 3 pricing cards: Free $0/month, Monthly $29/month (purple
border + "MOST POPULAR" ribbon), Full Program $69 one-time ("Save $18"). Copy:
"Start free, upgrade when you are ready. No credit card required for free tier."
NOTE: pricing is a business decision — the prototype's prices are reference values,
confirm before going live.

**Final CTA** — purple rounded-3xl panel: "Ready to Pass Your RENR?" + white "Get
Started Free" and outlined "Browse Topics".

## 2. Login (`/login`)

Light purple-gray bg, centered column (~max-w-md). Logo, "Welcome Back", "Sign in to
access your personalized study dashboard". "YOUR STUDY JOURNEY" strip: 4 numbered
purple-circle steps (1 Login, 2 Practice, 3 Create, 4 Rank Up). White rounded-2xl
card with purple icon, "Student Sign In". Form: Email (mail icon), Password (lock
icon, eye toggle), full-width purple "Sign In". Below: "Don't have an account?
**Sign up**", divider, "Instructor Access" link, highlight card "25 free questions
per day — no credit card required / Upgrade anytime for unlimited access", Terms
footnote.

## 3. Question Bank (`/question-bank`) → our `/study/practice`

Purple banner: "Question Bank" + "Select your topics, set your preferences, and start
practicing." Two-column: left ~3/5 filter groups (small uppercase gray-600 labels):
SELECT TOPICS (scrollable checkbox card, "✓ Deselect All"), NUMBER OF QUESTIONS
(pills 10/25/50/100), DOMAIN FILTER pills, TAXONOMY LEVEL pills (Mixed/Knowledge/
Application/Analysis), QUIZ MODE two selectable cards (Timed: clock icon / Untimed:
infinity icon). Right ~2/5 sticky white Session Summary card: label/value rows
(Topics, Questions, Mode), full-width purple "▶ Start Session", micro-copy
"Free tier: 25 questions/day". Flow: Start → `/quiz-session?topics=…`.

## 4. Quiz Session (`/quiz-session`) → our TutorSession

Top bar (white, sticky, border-b): "‹ Exit" left; "Question 1 of 25" bold; right: thin
purple progress bar (h-2 rounded-full) + clock + countdown (timed mode).
max-w-3xl centered on gray-50:
- Stem in white rounded-2xl border shadow-sm p-6–8 card, `text-base md:text-lg
  font-medium`.
- Options: full-width `rounded-xl border-2` rows, 8×8 circular letter badge (A–D,
  bordered, gray-500). Hover: `border-[#6B2D8B] bg-purple-50`. Selected: purple
  border + purple-filled letter circle + light purple bg.
- Footer: "‹ Previous" (ghost, disabled on Q1) + "Next ›" primary (disabled until
  selected); last question "Finish ›".
- After answering: inline feedback — domain/topic badge pills ("PC | KC | Nursing
  Profession / Documentation"), "Correct!" / incorrect, rationale text, "Study &
  Review" recommendations ("Review why each incorrect option is wrong to strengthen
  your understanding for the exam.").
- Empty state: "No Questions Found — Your filters returned no matching questions…"
  + "Back to Question Bank".
- Session end: "Session Complete" with Correct / Incorrect / Unanswered counts.

## 5. Case Studies (`/case-studies`)

Purple banner: "‹ Back to Question Bank" ghost link, "Case Study Simulations",
"Interactive clinical scenarios designed for professional development. Progress
through real patient cases with decision points and detailed feedback."
3-col grid of white cards: two pill badges (difficulty amber "Advanced" / rose
"Expert"; category light purple "Clinical Decision Making" / "Nursing Practice"),
case title, 2–3 line vignette, footer meta "8 decision points" (clipboard) + "~10
min" (clock).

**Detail = full-screen takeover:** header bar (X close circle, case title, "Phase 1
of 8", segmented progress bar right). Case Scenario card: white rounded-2xl, 4px left
purple accent border, person icon + "Case Scenario" + right timestamp "8:00am". Vital
Signs strip card (six columns T/P/R/BP/SpO₂/RBS). Physical Assessment card (teal left
border, "Head-to-Toe" tag). Initial Assessment decision card: question stem + 4 option
rows (same selected styling as quiz) + centered purple "Submit Answer".

## 6. Mock Exam (`/mock-exam`) → our `/study/mock-exams`

Plain white page (no purple banner). Header row: brain-circuit icon + "Mock Exams" +
"RENR-style 100-question exams • 2.5 hours each"; right "Current Week / Week 1".
Schedule banner (light purple tint): calendar icon, "This Week's Schedule (Week 1)",
"2 exams per week • Monday & Thursday at 12:00 AM", day chips Mon/Thu.
Grid of 16 exam cards (4 cols): "Mock Exam N", "Week N • Monday|Thursday • 100
questions", gray "Week N" pill. Locked cards: lock icon, grayed out. Available cards:
white with play icon; click expands in place (accordion) → full-width purple
"Start Exam" button.

**Mode modal:** centered white rounded-2xl shadow card: "Choose Your Exam Mode",
"Mock Exam 1 — 100 questions, 2.5 hours". Two tiles: Solo (user icon, "Take the exam
alone", "Base EXP") / Group (user-plus icon, "Parallel with friends", green "+10% EXP
& ELO"). Footnote: "Group mode: You and friends take the same exam in parallel, not
together. Everyone gets 10% bonus EXP and ELO."

**In-exam:** slim top bar: pause icon, "Mock Exam 1", clock "149:59"; right: flag
icon + "1/100"; thin purple progress line at top edge. Stem numbered "1."; answer rows
plain rounded-xl (no letter circles), selected = purple border; "‹ Previous"/"Next ›".
Also: Question Navigator grid jump, "Exam Paused" overlay with "Quit & Discard",
fatigue nudge: "Your performance dropped in the final quarter. Consider taking short
breaks…"

## 7. Analytics (`/analytics`) — NO BACKING TABLES in our schema

Purple banner: "Performance Insights" / "Your Analytics". Period pills (Today / This
Week / This Month). 4 stat cards (icon + label + big number + delta): Questions 410
("+12% this week" green), Accuracy 76%, Study Time 24.5h, Streak 12 days.
Charts: Weekly Activity (multi-line/area, purple+green), Domain Strength (radar over
7 axes NP/CDM/NLM/PC/HPMW/COM/PD). Taxonomy Performance horizontal bars + Topic
Strength list (colored bars + %, green strong ≥85 / amber moderate 72–80 / red weak).
Mock Exam History table: Date, Questions, Score, Accuracy (color-coded), Time, Stamina
(mini progress bar). NOT BUILT — needs Ian's data-model decision.

## 8. Question Generation (`/question-generation`) — NO BACKING TABLES

Purple banner: "Active Learning Creator" / "Question Generation" / "AI assigns all
parameters — you focus on crafting the question." Left 2/3: "⚡ Choose Your Method" +
3 stacked method cards (icon tile, "Method 1/2/3" purple label + green "🔓 Available"
pill, title, description): Dedicated Question Generation Bank / Weakness Exploitation /
(post-review, below fold). "How AI Assignment Works" info card (Topic/Domain/Taxonomy/
Stem Length rows). Authoring flow: "AI is Assigning Your Parameters" loading (sparkles
in animated purple ring) → AI-Assigned Parameters (Topic/Stem Length/Domain/Taxonomy)
→ form: stem textarea, option inputs ("Click the letter circle to mark the correct
answer"), optional rationale ("Optional +50 bonus points") → "AI Evaluating Your
Question" → evaluation results (Stem Quality / Answer Options / Rationale) → "Daily
Goal Met!". Right rail: Daily Question Challenge card (red-tinted "Daily Question
Required — generate at least 1 question every 24 hours to access other NRG features"),
Scoring Breakdown (Stem 40% / Options 40% / Rationale +50 bonus / Passing 75+), Top
Contributors leaderboard (rank-colored number circles 1–5), CrossLink "Continue Your
Learning" gradient purple card, My Generated Questions (empty state).

## 9. Rank System (`/rank-system`) — NO BACKING TABLES

Purple banner: trophy icon + "NRG Rank System" / "Track your journey from Novice to
Expert Candidate. 25 levels based on Patricia Benner's framework." Right: "13 Current
Level", "9,840 Total XP". Underline tabs: Dashboard / Rank Ladder / Topic Mastery /
Leaderboard. Dashboard: current-rank hero (light green tint, circular level badge,
green rank name "Competent III", progress bar "9,840 / 10,400 XP", purple pill "Strong
mastery"); 4 stat cards (Total XP, Study Streak, Rank Up 3x, Mock Best 72%); "Next
Best Action" card ("Your weakest area is **Endocrine** (Elo 890)…"). Rank Ladder: tier
sections ("Novice (5 levels)") of level cards (numbered circle, name, XP, KC/AP/ASE
micro bars, lock icon for unreached). Topic Mastery: Elo ratings, Average/Highest/
Lowest/Strong stat cards, topic bars + mastery labels. Leaderboard: podium (#1 gold
crown center tall, #2 silver left, #3 bronze right, purple "#N" columns) + table
(#/Student/Rank/Readiness%/Weekly XP/Streak flame).

## 10. Study Lobby (`/study-lobby`) — NO BACKING TABLES

Purple banner: radio-tower icon + "Student Study Lobby" + "Join synchronized group
review sessions." Right: "+ Create Room" (prototype: "coming soon" notice). Stats
strip (4 items, tinted-circle icons): 3 Live Sessions (green), 38 Students Online
(purple), 3 Starting Soon (amber), 94% Avg. Pass Rate (blue). Topic filter pill row
(All selected + topics, horizontally scrollable). Room cards (3 cols): title, lock
icon, status pill — green pulsing-dot LIVE / amber Waiting; "Hosted by {username}";
meta pills: topic, "20 Qs", "45s each", "Anonymous"; bottom: occupancy "8/12" + CTA —
green solid "Join Live" / purple "Join". Empty state + "How Study Lobby Works"
explainer (1 Join a Room, 2 Click Ready, 3 Answer Together — "No answers shown during
the session", 4 Review at the End). Waiting Room flow: hourglass in purple circle,
"I'm Ready" button, ready progress "4/9 — 2 more needed to start", participants grid
(avatar, name, green Ready / gray Not ready), then synchronized questions ("lock it
in", "Waiting for other students…", "Session Complete!" with XP + rationale review).

## 11. Instructor Dashboard (`/instructor`) → our `/teacher`

Darker purple banner (deep #2D1B4E-leaning): shield icon + "Instructor Portal" +
"Dashboard"; right dark translucent "Export Report" button. Tab bar: Overview /
Students / Performance / Fatigue Analysis. Overview: 6 stat cards one row (48 Total
Students, 32 Active Today, 76% Avg Accuracy, 41 Avg Stamina, 18.5k Questions
Answered, 156 Mock Exams) + two charts (Weekly Class Activity area chart; Class
Domain Averages purple bar chart). Students tab: search + Filter; table: Student
(avatar+name+email), Questions, Accuracy (color-coded), Streak, Last Active, Stamina
mini bar, Status pill (green "On Track"/amber "Needs Attention"), eye action.
Performance tab: Class Performance Trends line chart + Domain Strength Comparison
radar + Student Question Generation Leaderboard podium rows. Fatigue Analysis tab:
Stamina Distribution donut (Low 0–29 / Moderate 30–59 / High 60+) + summary tiles
(18 Low Fatigue green / 22 Moderate amber / 8 High Fatigue Risk red) + "Key Insight"
paragraph + Students Needing Attention table (Stamina Score, Late-Exam Drop, Recommendation).

---

## Reusable patterns to replicate

1. Purple page banner: eyebrow (icon + category label), H1, one-sentence subtitle;
   darker variant for instructor.
2. Stat card: white card, small tinted icon square, gray label (sm), large bold value,
   optional delta caption (green/amber with trending icon).
3. Pill filter bar: `rounded-full border` chips; selected = solid purple.
4. Option rows: full-width `rounded-xl border-2` with circular letter badge; hover
   purple border + purple-50 bg; selected = purple border + filled purple circle +
   purple-50 bg.
5. Progress bars: thin (h-2 rounded-full) purple/green fills on gray-100 tracks.
6. Status pills: green LIVE/On Track/strong, amber Waiting/moderate, red weak/risk.
7. Review/queue tables: gray header row, avatar+name+subtext first column, color-coded
   metrics, trailing icon action.
8. CrossLink "Continue Your Learning" gradient purple card with 2–3 contextual
   next-step links.
9. Charts (Recharts in prototype): line/area, radar (7 domains), horizontal bars,
   vertical bars, donut — purple/green palette, thin gray gridlines. (We have NOT
   added Recharts; only add if Ian approves + a data model exists.)
10. Modal: centered white rounded-2xl shadow panel on light backdrop.
11. Free-tier micro-copy: "Free tier: 25 questions/day", "25 free questions per day".

## Prototype limitations (not design intent)

- Create Room = "coming soon"; lobby rooms are mock data.
- Quiz "Finish" results screen copy from bundle, not captured live.
- mockExamPoolBatch1–4 = bundled static data (ignored per Ian).
- Sign In / Sign up / Instructor Access have no backend.
