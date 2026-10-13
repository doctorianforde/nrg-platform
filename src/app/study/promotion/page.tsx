import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { flags } from "@/lib/flags";
import { loadRankV2 } from "@/lib/xp/rank-v2";
import { startPromotion } from "./actions";

export const dynamic = "force-dynamic";

/** Promotion quiz: the rules, then Start. An open attempt goes straight back to the quiz. */
export default async function PromotionPage({ searchParams }: { searchParams: { error?: string } }) {
  if (!flags.rankingV2) notFound();
  const { user, profile } = await requireRole("student", "/study/promotion");
  const rank = await loadRankV2(createClient(), user.id);
  if (rank.openAttemptId) redirect(`/study/promotion/${rank.openAttemptId}`);

  return (
    <DashboardShell profile={profile} email={user.email} title="Promotion quiz" eyebrow="Rank"
      subtitle={rank.next ? `Pass to move up from ${rank.rank.name} to ${rank.next.name}.` : "You are at the top of the ladder."}>
      <Link href="/study/profile" className="mb-4 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">← Your rank</Link>
      {searchParams.error ? <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{searchParams.error}</p> : null}
      <Card className="max-w-2xl rounded-xl border-brand-100">
        {!rank.next ? (
          <p className="text-sm text-muted-foreground">There are no more promotions. Well done.</p>
        ) : rank.eligible && !rank.retakeAt ? (
          <>
            <CardTitle>Before you start</CardTitle>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-card-foreground">
              <li>25 questions drawn across all seven RENR domains, in exam proportions.</li>
              <li>90 seconds for each question. When the time runs out, the question counts as wrong and the next one appears.</li>
              <li>Once you answer, you cannot go back.</li>
              <li>Pass with 17 or more correct to move up to {rank.next.name}.</li>
              <li>If you don&apos;t pass, you can try again after 24 hours with a fresh set of questions. Your XP is never taken away.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">Find a quiet spot: the clock starts as soon as the first question appears.</p>
            <form action={startPromotion} className="mt-5">
              <button className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800">Start the quiz</button>
            </form>
          </>
        ) : rank.retakeAt ? (
          <p className="text-sm text-card-foreground">You can try the {rank.next.name} quiz again from {new Date(rank.retakeAt).toLocaleString()}.</p>
        ) : (
          <p className="text-sm text-card-foreground">
            The {rank.next.name} quiz unlocks at {rank.next.minXp.toLocaleString()} XP. You need {rank.xpToUnlock.toLocaleString()} more:
            keep practising, sit mock exams and work on your weaker areas.
          </p>
        )}
      </Card>
    </DashboardShell>
  );
}
