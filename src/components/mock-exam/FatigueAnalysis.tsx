import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { accuracyTone, type FatigueReport, type FatigueSegment } from "@/lib/mock-exam/fatigue";

const ACCURACY_TEXT = {
  green: "text-green-600",
  amber: "text-amber-600",
  red: "text-red-600",
} as const;

function TrendingDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M21 17v-5h-5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function pace(seconds: number): string {
  if (seconds < 90) return `${seconds}s per question`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s per question`;
}

function SegmentCard({ segment, isFirst }: { segment: FatigueSegment; isFirst: boolean }) {
  const scored = segment.answered > 0;
  const tone = accuracyTone(segment.pct);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {segment.name}
        </span>
        {isFirst ? (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Baseline</span>
        ) : segment.drop === "significant" ? (
          <Badge tone="red">
            <TrendingDownIcon className="mr-1 h-3 w-3" />
            Drop
          </Badge>
        ) : segment.drop === "observed" ? (
          <Badge tone="amber">
            <TrendingDownIcon className="mr-1 h-3 w-3" />
            Lower
          </Badge>
        ) : null}
      </div>

      <p className={`mt-2 font-heading text-3xl font-bold ${scored ? ACCURACY_TEXT[tone] : "text-muted-foreground"}`}>
        {scored ? `${segment.pct}%` : "—"}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        {scored
          ? `${segment.correct} of ${segment.answered} answered correctly`
          : "No questions answered"}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {segment.skipped > 0 ? <Badge tone="amber">{segment.skipped} skipped</Badge> : null}
        {segment.secondsPerQuestion !== null ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ClockIcon className="h-3 w-3" />
            {pace(segment.secondsPerQuestion)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Quarter-by-quarter accuracy for a finished attempt.
 *
 * "Drop" (red) means the fall is larger than sampling error can explain; "Lower"
 * (amber) means it cleared the client's 15-point line but a quarter of this size
 * cannot separate it from chance. Keeping those apart matters: on a 25-question
 * quarter a 15-point gap happens by luck often enough that treating it as fatigue
 * would send students to fix a problem they may not have.
 */
export function FatigueAnalysis({ report }: { report: FatigueReport }) {
  const flagged = report.hasSignificantDrop;
  const usable = report.pattern !== "insufficient-data";

  return (
    <Card className="rounded-xl border-brand-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Fatigue analysis</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Accuracy on the questions you answered, quarter by quarter.
          </p>
        </div>
        {usable ? (
          <Badge tone={flagged ? "red" : report.pattern === "steady-strong" ? "green" : "gray"}>
            {report.headline}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {report.segments.map((segment, i) => (
          <SegmentCard key={segment.name} segment={segment} isFirst={i === 0} />
        ))}
      </div>

      {flagged ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <TrendingDownIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              Your accuracy dropped in the later part of this exam
            </p>
            <p className="text-sm text-red-800">{report.recommendation}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm text-card-foreground">{report.recommendation}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {usable ? (
          <>
            Quarter accuracy counts only answered questions, so it won&apos;t match your overall
            score when questions were skipped.{" "}
            {report.segments.some((s) => s.drop === "observed")
              ? "A quarter marked “Lower” fell 15 points or more, but a run of this length can’t separate that from chance. "
              : ""}
            {!report.paceAvailable
              ? "Timing per question isn’t shown because answers weren’t recorded in order — usually because questions were revisited."
              : ""}
          </>
        ) : (
          "Answer more of the paper to see how your accuracy holds up across it."
        )}
      </p>
    </Card>
  );
}
