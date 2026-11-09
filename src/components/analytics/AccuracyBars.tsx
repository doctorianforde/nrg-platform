import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { DomainState } from "@/lib/analytics/student";

export type AccuracyRow = {
  key: string;
  label: string;
  /** Short code shown before the label (NP, AP…). */
  code?: string;
  answered: number;
  correct: number;
  pct: number | null;
  state?: DomainState;
  /** Optional secondary line, e.g. "30% of the exam". */
  note?: string;
  practiceHref?: string;
};

export const STATE_META: Record<DomainState, { label: string; tone: BadgeTone; icon: string }> = {
  new: { label: "New", tone: "gray", icon: "○" },
  weak: { label: "Weak", tone: "red", icon: "▼" },
  developing: { label: "Developing", tone: "amber", icon: "◆" },
  mastered: { label: "Mastered", tone: "green", icon: "▲" },
};

/**
 * Horizontal accuracy bars, one series (brand fill) on a 0–100 % scale with two hairline reference marks: the Weak
 * ceiling and the Mastered floor from the ranking rules. Each row is focusable and shows the same detail on focus as
 * on hover; the state is a labelled badge with an icon (never colour alone); a table view below carries every value.
 */
export function AccuracyBars({
  rows,
  weakMaxPct,
  masteredMinPct,
  caption,
}: {
  rows: AccuracyRow[];
  weakMaxPct: number;
  masteredMinPct: number;
  caption: string;
}) {
  return (
    <div>
      <ul className="space-y-3.5">
        {rows.map((r) => {
          const tip = r.answered
            ? `${r.pct}% correct · ${r.correct} of ${r.answered} answered`
            : "No answers yet";
          return (
            <li key={r.key} className="group relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label={`${r.label}: ${tip}${r.state ? `, ${STATE_META[r.state].label}` : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-card-foreground">
                  {r.code ? <span className="mr-1.5 font-mono text-xs font-semibold text-muted-foreground">{r.code}</span> : null}
                  {r.label}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {r.state ? (
                    <Badge tone={STATE_META[r.state].tone}>
                      <span aria-hidden className="mr-1 text-[9px]">{STATE_META[r.state].icon}</span>
                      {STATE_META[r.state].label}
                    </Badge>
                  ) : null}
                  <span className="w-10 text-right text-sm font-semibold tabular-nums text-card-foreground">
                    {r.pct === null ? "—" : `${r.pct}%`}
                  </span>
                </div>
              </div>
              <div className="relative mt-1.5 h-2.5 w-full rounded-r bg-muted" aria-hidden>
                {r.pct !== null ? (
                  <div
                    className="h-full rounded-r bg-brand-600 transition-[width] duration-500"
                    style={{ width: `${Math.max(r.pct, 1.5)}%` }}
                  />
                ) : null}
                <span className="absolute inset-y-[-3px] w-px bg-foreground/25" style={{ left: `${weakMaxPct}%` }} />
                <span className="absolute inset-y-[-3px] w-px bg-foreground/25" style={{ left: `${masteredMinPct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {r.answered ? `${r.correct} of ${r.answered} correct` : "Not practised yet"}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
                {r.practiceHref ? (
                  <Link href={r.practiceHref} prefetch={false} className="font-medium text-brand-700 hover:underline">
                    Practise →
                  </Link>
                ) : null}
              </div>
              {/* Hover / focus readout: value first, label second. */}
              <span
                role="presentation"
                className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 max-w-full rounded-md border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <strong className="font-semibold">{r.pct === null ? "—" : `${r.pct}%`}</strong>{" "}
                <span className="text-muted-foreground">{r.label}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-3 rounded-r-sm bg-brand-600" />Accuracy</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-px bg-foreground/40" />Lines at {weakMaxPct}% (Weak at or below) and {masteredMinPct}% (Mastered at or above)</span>
      </p>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-muted-foreground">
            <tr><th className="py-1 pr-2 font-medium">Area</th><th className="py-1 pr-2 text-right font-medium">Answered</th><th className="py-1 pr-2 text-right font-medium">Correct</th><th className="py-1 pr-2 text-right font-medium">Accuracy</th>{rows.some((r) => r.state) ? <th className="py-1 font-medium">State</th> : null}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={cn("border-t border-border/70")}>
                <td className="py-1 pr-2">{r.code ? `${r.code} · ` : ""}{r.label}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.answered}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.correct}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.pct === null ? "—" : `${r.pct}%`}</td>
                {r.state ? <td className="py-1">{STATE_META[r.state].label}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
