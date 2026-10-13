import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { RANK_LADDER, type RankDefinition } from "./ranks";

type Db = SupabaseClient<Database>;

/** promotion_status() as returned by the database (migration 20261012160400 / 160600). */
export type PromotionStatus = {
  xp: number;
  xp_level: number;
  passed_level: number;
  rank_level: number;
  next_level: number | null;
  next_level_min_xp: number | null;
  eligible: boolean;
  open_attempt_id: string | null;
  retake_available_at: string | null;
};

/** What the student sees under ranking v2: rank, XP total, streak and promotion state. Nothing about multipliers. */
export type RankV2 = {
  xp: number;
  streak: number;
  rank: RankDefinition;
  next: RankDefinition | null;
  /** XP still needed before the next level's quiz unlocks (0 once eligible). */
  xpToUnlock: number;
  /** 0–100 progress from this rank's XP floor to the next level's. */
  pct: number;
  eligible: boolean;
  openAttemptId: string | null;
  retakeAt: string | null;
};

export async function loadRankV2(supabase: Db, userId: string): Promise<RankV2> {
  const [{ data: status }, { data: streak }] = await Promise.all([
    supabase.rpc("promotion_status"),
    supabase.rpc("study_streak_v2", { p_user: userId }),
  ]);
  const s = (status ?? {}) as Partial<PromotionStatus>;
  const xp = Number(s.xp ?? 0);
  const rank = RANK_LADDER[s.rank_level ?? 0] ?? RANK_LADDER[0];
  const next = s.next_level != null ? RANK_LADDER[s.next_level] ?? null : null;
  const floor = rank.minXp, target = next?.minXp ?? floor;
  return {
    xp,
    streak: typeof streak === "number" ? streak : 0,
    rank,
    next,
    xpToUnlock: next ? Math.max(0, next.minXp - xp) : 0,
    pct: next ? Math.max(0, Math.min(100, Math.round(((xp - floor) / Math.max(1, target - floor)) * 100))) : 100,
    eligible: Boolean(s.eligible),
    openAttemptId: s.open_attempt_id ?? null,
    retakeAt: s.retake_available_at ?? null,
  };
}

/** One state of the promotion quiz, from promotion_current() / promotion_answer(). */
export type PromotionState =
  | {
      done: false;
      attempt_id: string;
      target_level: number;
      position: number;
      total: number;
      seconds_left: number;
      timed_out?: boolean;
      question: { id: string; body: string; question_type: string; options: { id: string; body: string }[] };
    }
  | { done: true; score: number; total: number; passed: boolean; target_level: number; pass_mark: number; timed_out?: boolean };
