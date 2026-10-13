"use server";

import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { flags } from "@/lib/flags";
import { loadUnseenBadges } from "./queries";
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
