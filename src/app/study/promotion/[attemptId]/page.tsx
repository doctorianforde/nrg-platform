import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { flags } from "@/lib/flags";
import { RANK_LADDER } from "@/lib/xp/ranks";
import type { PromotionState } from "@/lib/xp/rank-v2";
import { PromotionRunner } from "./PromotionRunner";

export const dynamic = "force-dynamic";

/**
 * The quiz itself. Loading the page asks the server for the current question, which starts its 90-second clock if it
 * hasn't started; reloading keeps the same clock. Nothing about later questions or the key reaches the browser.
 */
export default async function PromotionAttemptPage({ params }: { params: { attemptId: string } }) {
  if (!flags.rankingV2) notFound();
  const { user, profile } = await requireRole("student", `/study/promotion/${params.attemptId}`);
  if (!/^[0-9a-f-]{36}$/i.test(params.attemptId)) notFound();
  const { data, error } = await createClient().rpc("promotion_current", { p_attempt: params.attemptId });
  if (error || !data) notFound();
  const state = data as unknown as PromotionState;
  const target = RANK_LADDER[state.target_level];

  return (
    <DashboardShell profile={profile} email={user.email} title="Promotion quiz" eyebrow="Rank" subtitle={`Moving up to ${target?.name ?? "the next level"}`}>
      <PromotionRunner attemptId={params.attemptId} initial={state} targetName={target?.name ?? "the next level"} />
    </DashboardShell>
  );
}
