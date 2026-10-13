/** A badge as the celebrations and the trophy case need it (definition + when it was earned). */
export type EarnedBadge = {
  code: string;
  name: string;
  description: string;
  category: string;
  /** Which celebration plays: a full ceremony (promotions, trophies), a reveal card, or a toast. */
  weight: "ceremony" | "major" | "toast";
  tier: string | null;
  art: string;
  earnedAt: string;
};

/** Rank badges are drawn from the five tier medals with a numeral: levels 1–4 are Novice II–V, 5 is Advanced Beginner I… */
export function rankLevel(code: string): number | null {
  const m = /^rank-(\d+)$/.exec(code);
  return m ? Number(m[1]) : null;
}
const ROMAN = ["I", "II", "III", "IV", "V"];
export function rankNumeral(level: number): string {
  return ROMAN[level - Math.floor(level / 5) * 5];
}
export function tierOfLevel(level: number): string {
  return ["novice", "advanced-beginner", "competent", "proficient", "expert"][Math.min(4, Math.floor(level / 5))];
}

/** Ceremony first, then major reveals, then toasts; within each, oldest first. */
export const WEIGHT_ORDER: Record<EarnedBadge["weight"], number> = { ceremony: 0, major: 1, toast: 2 };
