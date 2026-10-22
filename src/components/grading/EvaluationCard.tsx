import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import type { FinalGrade } from "@/lib/grading/rubric";

export type EvaluationView = {
  status: "queued" | "running" | "done" | "failed";
  pathway: "api" | "agent";
  overall: number | null;
  passed: boolean | null;
  result: FinalGrade | null;
};

function Bar({ label, score, max, strengths, improve }: { label: string; score: number; max: number; strengths?: string; improve?: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-card-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{score}/{max}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct >= 75 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
      </div>
      {strengths ? <p className="mt-1 text-xs text-card-foreground"><strong className="text-green-700">Good: </strong>{strengths}</p> : null}
      {improve ? <p className="mt-0.5 text-xs text-card-foreground"><strong className="text-brand-700">Improve: </strong>{improve}</p> : null}
    </div>
  );
}

/** The AI grade for one student question: score, pass/fail, the three bars and the feedback. `staff` adds the key check. */
export function EvaluationCard({ ev, staff = false, open = false }: { ev: EvaluationView; staff?: boolean; open?: boolean }) {
  if (ev.status !== "done" || !ev.result) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {ev.status === "failed" ? "AI grading failed; a teacher will review it." : ev.pathway === "agent" ? "Waiting in the AI grading queue." : "Grading…"}
      </p>
    );
  }
  const g = ev.result;
  return (
    <details open={open} className="mt-2 rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
        <Badge tone={ev.passed ? "green" : "amber"} dot>{ev.passed ? "AI: pass" : "AI: not yet"}</Badge>
        <span className="font-semibold tabular-nums text-card-foreground">{ev.overall}/100</span>
        {g.scores.bonus ? <span className="text-xs text-green-700">incl. +{g.scores.bonus} rationale bonus</span> : null}
        <span className="ml-auto text-xs text-brand-700 underline">Feedback</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-card-foreground">{g.summary}</p>
        {!g.key_check.student_key_is_correct || !g.key_check.single_best_answer ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
            <strong>Answer key: </strong>{g.key_check.note}
          </p>
        ) : staff && g.key_check.note ? (
          <p className="text-xs text-muted-foreground"><strong>Key check: </strong>{g.key_check.note}</p>
        ) : null}
        <Bar label="Stem" score={g.scores.stem} max={30} strengths={g.stem.strengths} improve={g.stem.improve} />
        <Bar label="Options" score={g.scores.options} max={45} strengths={g.options.strengths} improve={g.options.improve} />
        <Bar label="Fit to the assignment" score={g.scores.alignment} max={25} improve={g.alignment.feedback} />
        {g.rationale.provided ? <p className="text-xs text-card-foreground"><strong>Rationale (+{g.scores.bonus}): </strong>{g.rationale.feedback}</p> : null}
        {g.next_steps.length ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next time</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-card-foreground">
              {g.next_steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        ) : null}
      </div>
    </details>
  );
}
