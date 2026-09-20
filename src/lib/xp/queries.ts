import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { rankFor, type RankProgress } from "./ranks";

type Db = SupabaseClient<Database>;

export type XpSummary = RankProgress & {
  /** Total per reason, for the "where this came from" breakdown. */
  byReason: { reason: string; amount: number; count: number }[];
};

/**
 * A student's XP and rank.
 *
 * Totalled from the ledger rather than a stored counter, so the number can never
 * drift from the events behind it. RLS limits the rows to your own (or, for staff,
 * anyone's).
 */
export async function loadXp(supabase: Db, userId: string): Promise<XpSummary> {
  const { data } = await supabase
    .from("xp_events")
    .select("amount, reason")
    .eq("user_id", userId)
    .limit(5000);

  const rows = data ?? [];
  const totals = new Map<string, { amount: number; count: number }>();
  let xp = 0;
  for (const r of rows) {
    xp += r.amount;
    const acc = totals.get(r.reason) ?? { amount: 0, count: 0 };
    acc.amount += r.amount;
    acc.count += 1;
    totals.set(r.reason, acc);
  }

  return {
    ...rankFor(xp),
    byReason: Array.from(totals.entries())
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export type SubmissionRow = {
  id: string;
  body: string;
  reviewStatus: string;
  reviewNotes: string | null;
  createdAt: string;
  optionCount: number;
};

/** A student's own submitted questions, newest first. */
export async function loadMySubmissions(supabase: Db, userId: string): Promise<SubmissionRow[]> {
  const { data } = await supabase
    .from("questions")
    .select("id, body, review_status, review_notes, created_at, question_options(id)")
    .eq("created_by", userId)
    .eq("is_ai_generated", false)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((q) => ({
    id: q.id,
    body: q.body,
    reviewStatus: q.review_status,
    reviewNotes: q.review_notes,
    createdAt: q.created_at,
    optionCount: q.question_options.length,
  }));
}
