import { createClient } from "@/lib/supabase/server";
import { loadUnseenBadges } from "@/lib/badges/queries";
import { BadgeCelebrations } from "./BadgeCelebrations";

/** Loads the student's unseen badges on every page render and hands them to the client player. */
export async function BadgeCelebrationsServer({ userId }: { userId: string }) {
  const unseen = await loadUnseenBadges(createClient(), userId);
  return <BadgeCelebrations initial={unseen} />;
}
