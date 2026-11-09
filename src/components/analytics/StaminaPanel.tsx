import Link from "next/link";
import { FatigueAnalysis } from "@/components/mock-exam/FatigueAnalysis";
import type { StaminaEntry } from "@/lib/analytics/student";
import type { FatiguePattern } from "@/lib/mock-exam/fatigue";

const PATTERN: Record<FatiguePattern, string> = {
  "insufficient-data": "Too short to tell",
  "steady-strong": "Steady and strong",
  steady: "Steady",
  "gradual-decline": "Gradual decline",
  "late-drop": "Late drop",
  "low-throughout": "Low throughout",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Port_of_Spain" });

/**
 * Exam stamina: does accuracy hold up to the end of a mock exam? The latest mock's quarter-by-quarter report (the same
 * one its results page shows), then a short history so a student can see whether stamina is improving.
 */
export function StaminaPanel({ entries }: { entries: StaminaEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Finish a mock exam to see how your accuracy holds up from the first quarter to the last.{" "}
        <Link href="/study/mock-exams" prefetch={false} className="font-medium text-brand-700 hover:underline">Mock exams →</Link>
      </p>
    );
  }
  const latest = entries.find((e) => e.report) ?? null;
  return (
    <div className="space-y-4">
      {latest?.report ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Latest analysed: <span className="font-medium text-card-foreground">{latest.title}</span> · {fmtDate(latest.completedAt)}
          </p>
          <FatigueAnalysis report={latest.report} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your mock exams so far are too short to split into quarters (16 questions or more are needed).
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Your recent mock exams: score, change from the first to the last quarter, and pattern</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Mock exam</th>
              <th className="py-1.5 pr-3 text-right font-medium">Score</th>
              <th className="py-1.5 pr-3 text-right font-medium">Last vs first quarter</th>
              <th className="py-1.5 font-medium">Pattern</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const drop = e.report && e.report.pattern !== "insufficient-data" ? -e.report.finalQuarterDrop : null;
              return (
                <tr key={e.sessionId} className="border-t border-border/70">
                  <td className="py-1.5 pr-3">
                    <Link href={`/study/mock-exams/session/${e.sessionId}`} prefetch={false} className="text-card-foreground hover:text-primary hover:underline">
                      {e.title}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{fmtDate(e.completedAt)}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{e.scorePct === null ? "—" : `${Math.round(e.scorePct)}%`}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {drop === null ? "—" : `${drop > 0 ? "+" : drop < 0 ? "−" : "±"}${Math.abs(Math.round(drop))} pts`}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground">{e.report ? PATTERN[e.report.pattern] : PATTERN["insufficient-data"]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
