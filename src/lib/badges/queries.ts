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

export type BadgeDef = { code: string; name: string; description: string; category: string; weight: string; tier: string | null; art: string; sort_order: number; is_secret: boolean };
export type MiniBadge = { code: string; art: string; name: string };

/** Every active badge, in display order. */
export async function loadBadgeCatalogue(supabase: Db): Promise<BadgeDef[]> {
  const { data } = await supabase
    .from("badge_definitions")
    .select("code, name, description, category, weight, tier, art, sort_order, is_secret")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as BadgeDef[];
}

/** A student's earned badges: code → earned_at. RLS decides whether the caller may see them. */
export async function loadEarned(supabase: Db, userId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from("user_badges").select("badge_code, earned_at").eq("user_id", userId);
  return new Map((data ?? []).map((r) => [r.badge_code, r.earned_at]));
}

/** The latest `n` badges for each of several students, for small strips next to names. Hidden students return none. */
export async function loadBadgeStrips(supabase: Db, userIds: string[], n = 3): Promise<Map<string, MiniBadge[]>> {
  const out = new Map<string, MiniBadge[]>();
  if (!userIds.length) return out;
  const [{ data: rows }, defs] = await Promise.all([
    supabase.from("user_badges").select("user_id, badge_code, earned_at").in("user_id", userIds).order("earned_at", { ascending: false }),
    loadBadgeCatalogue(supabase),
  ]);
  const byCode = new Map(defs.map((d) => [d.code, d]));
  for (const r of rows ?? []) {
    const d = byCode.get(r.badge_code); if (!d) continue;
    const list = out.get(r.user_id) ?? [];
    if (list.length < n) list.push({ code: d.code, art: d.art, name: d.name });
    out.set(r.user_id, list);
  }
  return out;
}

export type WallEntry = { userId: string; name: string; badge: MiniBadge; earnedAt: string };

/** Badges classmates earned recently (only students who show their badges). */
export async function loadBadgeWall(supabase: Db, days = 7, limit = 30): Promise<WallEntry[]> {
  const [{ data }, defs] = await Promise.all([
    supabase.rpc("recent_badge_wall", { p_days: days, p_limit: limit }),
    loadBadgeCatalogue(supabase),
  ]);
  const byCode = new Map(defs.map((d) => [d.code, d]));
  return ((data ?? []) as { user_id: string; display_name: string; badge_code: string; earned_at: string }[]).flatMap((r) => {
    const d = byCode.get(r.badge_code);
    return d ? [{ userId: r.user_id, name: r.display_name, badge: { code: d.code, art: d.art, name: d.name }, earnedAt: r.earned_at }] : [];
  });
}
