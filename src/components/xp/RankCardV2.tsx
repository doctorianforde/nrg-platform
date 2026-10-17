import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { RANK_LADDER, TIER_TONE } from "@/lib/xp/ranks";
import type { RankV2 } from "@/lib/xp/rank-v2";

/**
 * Ranking v2 rank card (flag NEXT_PUBLIC_RANKING_V2). Shows only what Jade wants students to see: rank, XP total and
 * streak, plus whether a promotion quiz is open to them. No multipliers or XP breakdown.
 */
export function RankCardV2({ rank }: { rank: RankV2 }) {
  const { rank: current, next } = rank;
  return (
    <Card className="rounded-xl border-brand-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Your rank</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{current.description}</p>
        </div>
        <Badge tone={TIER_TONE[current.tier]}>{current.name}</Badge>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="font-heading text-4xl font-bold text-brand-700">
          {rank.xp.toLocaleString()} <span className="text-base font-medium text-muted-foreground">XP</span>
        </p>
        <Streak days={rank.streak} />
      </div>
      <p className="text-xs text-muted-foreground">
        Level {current.level + 1} of {RANK_LADDER.length} · {current.tier}
      </p>

      {next ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={rank.pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-600" style={{ width: `${rank.pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {rank.xpToUnlock > 0
              ? `${rank.xpToUnlock.toLocaleString()} XP to unlock the ${next.name} promotion quiz`
              : `You have the XP for ${next.name}. Pass the promotion quiz to move up.`}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Top of the ladder: Expert V.</p>
      )}

      {next && rank.eligible ? <PromotionCallout rank={rank} nextName={next.name} /> : null}

      <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-sm">
        <Link href="/study/practice" className="text-brand-700 underline">Practise</Link>
        <Link href="/study/mock-exams" className="text-brand-700 underline">Sit a mock exam</Link>
        <Link href="/study/submit" className="text-brand-700 underline">Write a question</Link>
      </div>
    </Card>
  );
}

function PromotionCallout({ rank, nextName }: { rank: RankV2; nextName: string }) {
  const box = "mt-4 rounded-lg border px-4 py-3 text-sm";
  if (rank.openAttemptId) {
    return (
      <div className={`${box} border-amber-300 bg-amber-50 text-amber-900`}>
        <p className="font-medium">Your {nextName} promotion quiz is in progress.</p>
        <Link href={`/study/promotion/${rank.openAttemptId}`} className="mt-2 inline-block rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground hover:bg-primary-hover">
          Resume the quiz
        </Link>
      </div>
    );
  }
  if (rank.retakeAt) {
    return (
      <div className={`${box} border-border bg-muted text-card-foreground`}>
        <p className="font-medium">Promotion quiz for {nextName}</p>
        <p className="mt-1 text-muted-foreground">You can try again from {new Date(rank.retakeAt).toLocaleString()}.</p>
      </div>
    );
  }
  return (
    <div className={`${box} border-brand-200 bg-brand-50 text-brand-900`}>
      <p className="font-medium">Promotion quiz available</p>
      <p className="mt-1 text-brand-800">Pass it to move up to {nextName}.</p>
      <Link href="/study/promotion" className="mt-2 inline-block rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground hover:bg-primary-hover">
        Take the quiz
      </Link>
    </div>
  );
}

function Streak({ days }: { days: number }) {
  const on = days > 0;
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-orange-50 text-orange-700" : "bg-muted text-muted-foreground"}`}
      title="Days in a row with 10 or more questions answered">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2c.5 3-1.5 4.8-3 6.6C7.6 10.3 6 12.2 6 15a6 6 0 0 0 12 0c0-2.2-.9-3.9-2-5.3-.3 1.3-1 2.3-2 2.8.3-3.4-.6-7.2-2-10.5Z" />
      </svg>
      {days} day{days === 1 ? "" : "s"}
    </div>
  );
}
