import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  COHORT_HIGH_DROP,
  COHORT_MODERATE_DROP,
  type CohortFatigue,
} from "@/lib/mock-exam/fatigue";

function Band({
  label,
  count,
  total,
  bar,
  text,
}: {
  label: string;
  count: number;
  total: number;
  bar: string;
  text: string;
}) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`font-heading text-lg font-bold ${text}`}>{count}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

/**
 * How this cohort's accuracy holds up across an exam.
 *
 * Attempts are grouped by the points between a student's first and last quarter,
 * which is measured rather than estimated. Names aren't shown: RLS lets teachers
 * read sessions but not other users' profiles, so attempts are necessarily
 * anonymous here.
 */
export function CohortFatigueCard({ cohort }: { cohort: CohortFatigue | null }) {
  if (!cohort) {
    return (
      <Card className="rounded-xl border-brand-100">
        <CardTitle>Cohort fatigue</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing to compare yet. Once students complete attempts with enough answered
          questions, their quarter-by-quarter accuracy appears here.
        </p>
      </Card>
    );
  }

  const { attempts, stable, moderate, high, significant, lateDrop, medianDrop } = cohort;

  return (
    <Card className="rounded-xl border-brand-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Cohort fatigue</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Points between each student&apos;s first and last quarter, across {attempts} completed{" "}
            {attempts === 1 ? "attempt" : "attempts"}.
          </p>
        </div>
        <Badge tone={medianDrop >= COHORT_HIGH_DROP ? "red" : medianDrop >= COHORT_MODERATE_DROP ? "amber" : "green"}>
          Median {medianDrop >= 0 ? "−" : "+"}
          {Math.abs(medianDrop)} points
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Band
          label={`Held steady (under ${COHORT_MODERATE_DROP})`}
          count={stable}
          total={attempts}
          bar="bg-green-500"
          text="text-green-700"
        />
        <Band
          label={`Some decline (${COHORT_MODERATE_DROP}–${COHORT_HIGH_DROP - 1})`}
          count={moderate}
          total={attempts}
          bar="bg-amber-400"
          text="text-amber-700"
        />
        <Band
          label={`Marked decline (${COHORT_HIGH_DROP}+)`}
          count={high}
          total={attempts}
          bar="bg-red-500"
          text="text-red-700"
        />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-card-foreground">
        {significant > 0 ? (
          <p>
            {significant} of {attempts} {significant === 1 ? "attempt shows" : "attempts show"} a
            fall too large to put down to chance
            {lateDrop > 0 ? `, and ${lateDrop} held up before falling away in the last quarter` : ""}
            . Where the decline is late rather than gradual, timed practice at full length tends to
            help more than extra content revision.
          </p>
        ) : (
          <p>
            No attempt shows a decline larger than sampling error, so stamina doesn&apos;t look like
            this group&apos;s limiting factor. Differences between quarters this size are what you
            would expect from chance alone.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Attempts are anonymous here — teachers can read exam sessions but not student profiles.
      </p>
    </Card>
  );
}
