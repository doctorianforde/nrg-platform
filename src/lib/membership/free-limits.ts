import { adminClient } from "@/lib/supabase/admin";

/** The free plan's limits as the database enforces them (tier_config), for the public plan cards. tier_config is
 *  readable only by signed-in users, so this reads it on the server; the values are not sensitive. */
export type FreeLimits = { practicePerDay: number; reviewsPerDay: number; reviewMinutes: number; mockExams: boolean };

const DEFAULTS: FreeLimits = { practicePerDay: 10, reviewsPerDay: 1, reviewMinutes: 5, mockExams: false };

export async function loadFreeLimits(): Promise<FreeLimits> {
  const { data, error } = await adminClient.from("tier_config" as never).select("key, value");
  if (error || !data) return DEFAULTS;
  const m = new Map((data as unknown as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  const n = (k: string, d: number) => (Number.isFinite(m.get(k)) ? (m.get(k) as number) : d);
  return {
    practicePerDay: n("free_practice_per_day", DEFAULTS.practicePerDay),
    reviewsPerDay: n("free_reviews_per_day", DEFAULTS.reviewsPerDay),
    reviewMinutes: n("free_review_minutes", DEFAULTS.reviewMinutes),
    mockExams: n("free_mock_exams", 0) > 0,
  };
}
