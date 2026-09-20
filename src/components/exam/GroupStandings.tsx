import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

export type Standing = {
  studentId: string;
  name: string;
  scorePct: number | null;
  correct: number | null;
  total: number | null;
  completed: boolean;
  isYou: boolean;
};

/**
 * How the group did, side by side.
 *
 * Scores only. A member's individual answers are never shown here and RLS does
 * not expose them either (`mock_exam_responses` stays own-or-staff), so a group
 * exam cannot be used to read a classmate's paper.
 */
export function GroupStandings({
  standings,
  title = "How the group did",
}: {
  standings: Standing[];
  title?: string;
}) {
  // Finished first, best score first; anyone still going sorts to the bottom.
  const ranked = [...standings].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return (b.scorePct ?? -1) - (a.scorePct ?? -1);
  });
  const done = ranked.filter((s) => s.completed && s.scorePct !== null);
  const average =
    done.length > 0
      ? Math.round(done.reduce((n, s) => n + (s.scorePct ?? 0), 0) / done.length)
      : null;

  return (
    <section className="rounded-2xl border border-brand-100 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-base font-semibold text-card-foreground">{title}</h3>
        {average !== null ? (
          <p className="text-sm text-muted-foreground">
            Group average <strong className="text-card-foreground">{average}%</strong>
          </p>
        ) : null}
      </div>

      <ol className="mt-4 space-y-2">
        {ranked.map((s, i) => (
          <li
            key={s.studentId}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
              s.isYou ? "border-brand-300 bg-brand-50/60" : "border-border"
            )}
          >
            <span className="w-5 shrink-0 text-right font-semibold text-muted-foreground">
              {s.completed ? i + 1 : "–"}
            </span>
            <span className="truncate text-card-foreground">{s.name}</span>
            {s.isYou ? <Badge tone="blue">You</Badge> : null}
            <span className="ml-auto shrink-0 text-right">
              {s.completed && s.scorePct !== null ? (
                <>
                  <strong className="text-card-foreground">{Math.round(s.scorePct)}%</strong>
                  {s.total ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {s.correct}/{s.total}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">still going…</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-muted-foreground">
        Everyone answered for themselves, so each score is that person&apos;s own — and only
        scores are shared here, never anyone&apos;s answers.
      </p>
    </section>
  );
}
