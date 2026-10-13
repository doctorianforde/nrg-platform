"use server";

import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { flags } from "@/lib/flags";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadBadgeCatalogue, loadEarned, loadUnseenBadges, type MiniBadge } from "./queries";
import type { EarnedBadge } from "./types";

/** Unseen badges for the signed-in student (used after client-side flows such as finishing practice). */
export async function fetchUnseenBadges(): Promise<EarnedBadge[]> {
  if (!flags.rankingV2) return [];
  const session = await getSession();
  if (!session?.profile || session.profile.role !== "student") return [];
  return loadUnseenBadges(createClient(), session.user.id);
}

/** Record that these badges' celebrations have played. The database only updates the caller's own badges. */
export async function markBadgesSeen(codes: string[]): Promise<void> {
  if (!flags.rankingV2 || codes.length === 0) return;
  await createClient().rpc("mark_badges_seen", { p_codes: codes });
}

/** "Show my badges to classmates" switch on the trophies page. */
export async function setShowBadges(formData: FormData): Promise<void> {
  if (!flags.rankingV2) return;
  const session = await getSession();
  if (!session?.profile) return;
  const show = formData.get("show") === "1";
  await createClient().from("profiles").update({ show_badges: show }).eq("id", session.user.id);
  revalidatePath("/study/profile");
  redirect("/study/trophies");   // re-render the page so the switch shows its new state
}

/** A classmate's badges for their trophy card. Returns nothing if they hide their badges (RLS and the name function agree). */
export async function fetchClassmateBadges(userId: string): Promise<{ name: string | null; badges: (MiniBadge & { earnedAt: string })[] }> {
  if (!flags.rankingV2 || !/^[0-9a-f-]{36}$/i.test(userId)) return { name: null, badges: [] };
  const supabase = createClient();
  const [{ data: name }, earned, defs] = await Promise.all([
    supabase.rpc("classmate_short_name", { p_user: userId }),
    loadEarned(supabase, userId),
    loadBadgeCatalogue(supabase),
  ]);
  const badges = defs.filter((d) => earned.has(d.code)).map((d) => ({ code: d.code, art: d.art, name: d.name, earnedAt: earned.get(d.code)! }));
  return { name: (name as string | null) ?? null, badges };
}
