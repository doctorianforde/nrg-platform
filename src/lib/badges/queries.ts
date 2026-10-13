import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { EarnedBadge } from "./types";

type Db = SupabaseClient<Database>;

/** The signed-in student's badges whose celebration hasn't played yet, with their definitions. */
export async function loadUnseenBadges(supabase: Db, userId: string): Promise<EarnedBadge[]> {
  const { data: rows } = await supabase
    .from("user_badges")
    .select("badge_code, earned_at")
    .eq("user_id", userId)
    .is("seen_at", null)
    .order("earned_at");
  if (!rows?.length) return [];
  const { data: defs } = await supabase
    .from("badge_definitions")
    .select("code, name, description, category, weight, tier, art")
    .in("code", rows.map((r) => r.badge_code));
  const byCode = new Map((defs ?? []).map((d) => [d.code, d]));
  return rows.flatMap((r) => {
    const d = byCode.get(r.badge_code);
    return d ? [{ code: d.code, name: d.name, description: d.description, category: d.category, weight: d.weight as EarnedBadge["weight"], tier: d.tier, art: d.art, earnedAt: r.earned_at }] : [];
  });
}
