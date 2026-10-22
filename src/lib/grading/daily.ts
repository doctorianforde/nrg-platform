import { createClient } from "@/lib/supabase/server";

/** The 24-hour rule (qgen_config.daily_rule): true when the caller must write a question before studying on. False on a
 *  database without 20261022180000, for staff, in a student's first day, and whenever the rule is off. */
export async function dailyQuestionDue(): Promise<boolean> {
  const { data, error } = await createClient().rpc("qgen_daily_status");
  return !error && (data as { due?: boolean } | null)?.due === true;
}
