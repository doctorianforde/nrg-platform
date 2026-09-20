/**
 * Ranks follow Patricia Benner's "From Novice to Expert" stages — the standard
 * nursing competency progression, so the ladder speaks the language students are
 * already learning rather than inventing game tiers.
 *
 * Thresholds are tuned against the award weights in the migration: a mock exam pays
 * 100 + score, an approved question 150, a practice run up to 25. Expert therefore
 * means sustained work across months, not a weekend.
 */
export const RANKS = [
  { name: "Novice", at: 0, blurb: "Getting started — rules and fundamentals." },
  { name: "Advanced Beginner", at: 300, blurb: "Recognising recurring patterns." },
  { name: "Competent", at: 1000, blurb: "Planning deliberately, seeing the longer view." },
  { name: "Proficient", at: 2500, blurb: "Reading situations as a whole." },
  { name: "Expert", at: 5000, blurb: "Fluent, intuitive clinical judgement." },
] as const;

export type RankName = (typeof RANKS)[number]["name"];

export const RANK_TONE: Record<RankName, "gray" | "blue" | "green" | "amber" | "purple"> = {
  Novice: "gray",
  "Advanced Beginner": "blue",
  Competent: "green",
  Proficient: "amber",
  Expert: "purple",
};

export const XP_REASON_LABEL: Record<string, string> = {
  mock_exam: "Mock exams",
  question_approved: "Approved questions",
  practice_session: "Practice sessions",
};

export type RankProgress = {
  xp: number;
  rank: RankName;
  blurb: string;
  /** Null at Expert, which is the top of the ladder. */
  nextRank: RankName | null;
  /** XP still needed for the next rank; 0 at the top. */
  toNext: number;
  /** 0–100 through the current band; 100 at the top. */
  pct: number;
};

export function rankFor(xp: number): RankProgress {
  const safe = Math.max(0, Math.floor(xp));
  let i = 0;
  for (let n = 0; n < RANKS.length; n++) if (safe >= RANKS[n].at) i = n;

  const current = RANKS[i];
  const next = RANKS[i + 1];
  if (!next) {
    return { xp: safe, rank: current.name, blurb: current.blurb, nextRank: null, toNext: 0, pct: 100 };
  }
  const span = next.at - current.at;
  return {
    xp: safe,
    rank: current.name,
    blurb: current.blurb,
    nextRank: next.name,
    toNext: next.at - safe,
    pct: Math.min(100, Math.round(((safe - current.at) / span) * 100)),
  };
}
