/**
 * Rank ladder, taken from the client's own design.
 *
 * Jade specified this in the prototype at OKComputer_NRG_Website
 * (`app/src/data/rankSystemData.ts`, `app/src/types/rankSystem.ts`): 25 levels,
 * five per tier, across Patricia Benner's Novice-to-Expert stages, 0 → 32,500 XP.
 * The thresholds, tier names and per-level descriptions below are his, kept verbatim
 * so the platform matches what he has already designed and taught against.
 *
 * Award weights are aligned to the same document — see `xp_for_*()` in
 * migration 20260920030000.
 */
export type Tier =
  | "Novice"
  | "Advanced Beginner"
  | "Competent Candidate"
  | "Proficient Candidate"
  | "Expert Candidate";

export type RankDefinition = {
  /** 0–24, matching the client's level numbering. */
  level: number;
  name: string;
  tier: Tier;
  tierIndex: number;
  minXp: number;
  description: string;
};

export const RANK_LADDER: RankDefinition[] = [
  { level: 0, name: "Novice I", tier: "Novice", tierIndex: 0, minXp: 0, description: "Beginning nursing student learning basic facts and skills." },
  { level: 1, name: "Novice II", tier: "Novice", tierIndex: 0, minXp: 200, description: "Building foundational knowledge of signs, symptoms, and interventions." },
  { level: 2, name: "Novice III", tier: "Novice", tierIndex: 0, minXp: 500, description: "Starting to recognise patterns in common nursing scenarios." },
  { level: 3, name: "Novice IV", tier: "Novice", tierIndex: 0, minXp: 900, description: "Developing basic safety awareness and clinical observation." },
  { level: 4, name: "Novice V", tier: "Novice", tierIndex: 0, minXp: 1400, description: "Ready to move beyond rote memorisation into guided reasoning." },
  { level: 5, name: "Advanced Beginner I", tier: "Advanced Beginner", tierIndex: 1, minXp: 2000, description: "Recognising common clinical cues and beginning to prioritise." },
  { level: 6, name: "Advanced Beginner II", tier: "Advanced Beginner", tierIndex: 1, minXp: 2700, description: "Managing standard patient situations with some guidance." },
  { level: 7, name: "Advanced Beginner III", tier: "Advanced Beginner", tierIndex: 1, minXp: 3500, description: "Developing clinical judgement in predictable scenarios." },
  { level: 8, name: "Advanced Beginner IV", tier: "Advanced Beginner", tierIndex: 1, minXp: 4400, description: "Near RENR-level in familiar topics, still building breadth." },
  { level: 9, name: "Advanced Beginner V", tier: "Advanced Beginner", tierIndex: 1, minXp: 5400, description: "On the cusp of competency — broad knowledge still developing." },
  { level: 10, name: "Competent I", tier: "Competent Candidate", tierIndex: 2, minXp: 6500, description: "Clinical reasoning emerging. Can handle most standard situations." },
  { level: 11, name: "Competent II", tier: "Competent Candidate", tierIndex: 2, minXp: 7700, description: "Care planning, medication safety, and prioritisation improving." },
  { level: 12, name: "Competent III", tier: "Competent Candidate", tierIndex: 2, minXp: 9000, description: "Consistent RENR-style application. Beginning to see the big picture." },
  { level: 13, name: "Competent IV", tier: "Competent Candidate", tierIndex: 2, minXp: 10400, description: "Strong clinical foundation. Ready for complex case reasoning." },
  { level: 14, name: "Competent V", tier: "Competent Candidate", tierIndex: 2, minXp: 11900, description: "Highly competent. Approaching proficient-level judgement." },
  { level: 15, name: "Proficient I", tier: "Proficient Candidate", tierIndex: 3, minXp: 13500, description: "Clinical judgement well-developed. Manages complexity with confidence." },
  { level: 16, name: "Proficient II", tier: "Proficient Candidate", tierIndex: 3, minXp: 15200, description: "Anticipates patient deterioration. Strong multi-system reasoning." },
  { level: 17, name: "Proficient III", tier: "Proficient Candidate", tierIndex: 3, minXp: 17000, description: "Majority analysis-level work, focused on Nursing Practice and Clinical Decision-Making." },
  { level: 18, name: "Proficient IV", tier: "Proficient Candidate", tierIndex: 3, minXp: 18900, description: "Advanced clinical reasoning. Leadership and delegation emerging." },
  { level: 19, name: "Proficient V", tier: "Proficient Candidate", tierIndex: 3, minXp: 20900, description: "Near expert. Handles complex, ambiguous clinical situations." },
  { level: 20, name: "Expert I", tier: "Expert Candidate", tierIndex: 4, minXp: 23000, description: "Complex judgement, teaching, professional decision-making." },
  { level: 21, name: "Expert II", tier: "Expert Candidate", tierIndex: 4, minXp: 25200, description: "Intuitive grasp of clinical situations. Mentors others." },
  { level: 22, name: "Expert III", tier: "Expert Candidate", tierIndex: 4, minXp: 27500, description: "Exceptional clinical reasoning. Ready to excel on the RENR." },
  { level: 23, name: "Expert IV", tier: "Expert Candidate", tierIndex: 4, minXp: 29900, description: "Mastery-level performance. Among the top candidates." },
  { level: 24, name: "Expert V", tier: "Expert Candidate", tierIndex: 4, minXp: 32500, description: "The pinnacle. A safe, thinking nurse ready for registration." },
];

/** Tier colours, also from the client's design. */
export const TIER_TONE: Record<Tier, "gray" | "blue" | "green" | "purple" | "amber"> = {
  Novice: "gray",
  "Advanced Beginner": "blue",
  "Competent Candidate": "green",
  "Proficient Candidate": "purple",
  "Expert Candidate": "amber",
};

export const TIERS: Tier[] = [
  "Novice",
  "Advanced Beginner",
  "Competent Candidate",
  "Proficient Candidate",
  "Expert Candidate",
];

export const XP_REASON_LABEL: Record<string, string> = {
  mock_exam: "Mock exams",
  question_approved: "Approved questions",
  practice_session: "Practice sessions",
};

export type RankProgress = {
  xp: number;
  level: number;
  rank: string;
  tier: Tier;
  description: string;
  /** Null at Expert V, the top of the ladder. */
  nextRank: string | null;
  /** XP still needed for the next level; 0 at the top. */
  toNext: number;
  /** 0–100 through the current level's band; 100 at the top. */
  pct: number;
};

export function rankFor(xp: number): RankProgress {
  const safe = Math.max(0, Math.floor(xp));
  let i = 0;
  for (let n = 0; n < RANK_LADDER.length; n++) if (safe >= RANK_LADDER[n].minXp) i = n;

  const current = RANK_LADDER[i];
  const next = RANK_LADDER[i + 1];
  const base = {
    xp: safe,
    level: current.level,
    rank: current.name,
    tier: current.tier,
    description: current.description,
  };
  if (!next) return { ...base, nextRank: null, toNext: 0, pct: 100 };

  const span = next.minXp - current.minXp;
  return {
    ...base,
    nextRank: next.name,
    toNext: next.minXp - safe,
    pct: Math.min(100, Math.round(((safe - current.minXp) / span) * 100)),
  };
}

/** Lowest level in each tier, for drawing the tier strip. */
export function tierStart(tier: Tier): number {
  return RANK_LADDER.find((r) => r.tier === tier)!.minXp;
}
