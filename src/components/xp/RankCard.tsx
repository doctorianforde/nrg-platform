import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { RANK_LADDER, TIER_TONE, TIERS, XP_REASON_LABEL } from "@/lib/xp/ranks";
import type { XpSummary } from "@/lib/xp/queries";

/**
 * Rank, XP and where it came from.
 *
 * The breakdown is deliberate: a student should be able to see that mock exams and
 * approved questions are what move the needle, rather than guessing at it.
 */
export function RankCard({ xp }: { xp: XpSummary }) {
  return (
    <Card className="rounded-xl border-brand-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Your rank</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{xp.description}</p>
        </div>
        <Badge tone={TIER_TONE[xp.tier]}>{xp.rank}</Badge>
      </div>

      <p className="mt-4 font-heading text-4xl font-bold text-brand-700">
        {xp.xp.toLocaleString()} <span className="text-base font-medium text-muted-foreground">XP</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Level {xp.level + 1} of {RANK_LADDER.length} · {xp.tier}
        {xp.streak > 0 ? ` · ${xp.streak}-day streak` : ""}
      </p>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-brand-600" style={{ width: `${xp.pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {xp.nextRank
            ? `${xp.toNext.toLocaleString()} XP to ${xp.nextRank}`
            : "Top of the ladder — Expert V."}
        </p>
      </div>

      {/* Tier strip rather than all 25 levels — the ladder is long. */}
      <ol className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
        {TIERS.map((tier) => {
          const reached = RANK_LADDER.some((r) => r.tier === tier && xp.xp >= r.minXp);
          return (
            <li
              key={tier}
              className={`rounded-full px-2 py-0.5 ${
                tier === xp.tier
                  ? "bg-brand-700 font-medium text-white"
                  : reached
                    ? "bg-brand-100 text-brand-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {tier.replace(" Candidate", "")}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 border-t border-border pt-3">
        {xp.byReason.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No XP yet. Sitting a mock exam or getting a question approved earns the most.
          </p>
        ) : (
          <dl className="space-y-1 text-sm">
            {xp.byReason.map((r) => (
              <div key={r.reason} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {XP_REASON_LABEL[r.reason] ?? r.reason}
                  <span className="ml-1 text-xs">×{r.count}</span>
                </dt>
                <dd className="font-medium text-card-foreground">+{r.amount.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href="/study/mock-exams" className="text-brand-700 underline">
          Sit a mock exam
        </Link>
        <Link href="/study/submit" className="text-brand-700 underline">
          Write a question
        </Link>
      </div>
    </Card>
  );
}
