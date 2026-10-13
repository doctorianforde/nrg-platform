import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import { BadgeArt } from "@/components/badges/BadgeArt";
import type { MiniBadge } from "@/lib/badges/queries";

/** Profile: the latest few badges and a link to the full trophy case. */
export function TrophyStrip({ latest, earned, total }: { latest: MiniBadge[]; earned: number; total: number }) {
  return (
    <Card className="rounded-xl border-brand-100">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Trophy case</CardTitle>
        <span className="text-xs text-muted-foreground">{earned} of {total}</span>
      </div>
      {latest.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {latest.map((b) => <span key={b.code} title={b.name}><BadgeArt code={b.code} art={b.art} size={56} /></span>)}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No badges yet. Answer your first question to earn First Steps.</p>
      )}
      <Link href="/study/trophies" className="mt-3 inline-block text-sm text-brand-700 underline">See all trophies</Link>
    </Card>
  );
}
