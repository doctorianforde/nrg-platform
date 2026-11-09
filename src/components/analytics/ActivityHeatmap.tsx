import type { ActivityDay } from "@/lib/analytics/student";

const WEEKS = 12;
/** Answers per day → step. Fixed bins (not quantiles) so a colour means the same amount every week. */
const BINS = [
  { min: 1, cls: "bg-brand-200", label: "1–9" },
  { min: 10, cls: "bg-brand-400", label: "10–24" },
  { min: 25, cls: "bg-brand-600", label: "25–49" },
  { min: 50, cls: "bg-brand-800", label: "50+" },
];
const EMPTY = "bg-muted";
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

const cellClass = (n: number) => [...BINS].reverse().find((b) => n >= b.min)?.cls ?? EMPTY;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Twelve weeks of study days (Trinidad dates, Monday first), one cell per day, sequential single hue: more answers =
 * a stronger brand step. The grid is one labelled image for screen readers; the table view lists every active day.
 */
export function ActivityHeatmap({ activity, today }: { activity: ActivityDay[]; today: string }) {
  const byDay = new Map(activity.map((a) => [a.day, a]));
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const start = addDays(today, -(WEEKS - 1) * 7 - weekday);
  const columns = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(start, w * 7 + d);
      return { day, future: day > today, a: byDay.get(day) };
    })
  );
  const inRange = activity.filter((a) => a.day >= start && a.day <= today);
  const daysStudied = inRange.length;
  const answers = inRange.reduce((s, a) => s + a.answered, 0);

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-5 text-[10px] leading-3 text-muted-foreground" aria-hidden>
          {DAY_LABELS.map((l, i) => <span key={i} className="h-3">{l}</span>)}
        </div>
        <div
          role="img"
          aria-label={`Study activity over the last ${WEEKS} weeks: ${daysStudied} days studied, ${answers} answers.`}
          className="flex gap-[3px]"
        >
          {columns.map((col, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              <span className="h-4 text-[10px] leading-4 text-muted-foreground" aria-hidden>
                {col[0].day.slice(8) <= "07" ? new Date(`${col[0].day}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : ""}
              </span>
              {col.map(({ day, future, a }) => (
                <span
                  key={day}
                  title={future ? undefined : `${a ? `${a.answered} answer${a.answered === 1 ? "" : "s"}, ${Math.round((100 * a.correct) / a.answered)}% correct` : "No study"} · ${fmt(day)}`}
                  className={`h-3 w-3 rounded-[3px] transition-transform hover:scale-125 ${future ? "bg-transparent" : cellClass(a?.answered ?? 0)} ${day === today ? "ring-1 ring-foreground/50" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          <strong className="font-semibold text-card-foreground">{daysStudied}</strong> day{daysStudied === 1 ? "" : "s"} studied ·{" "}
          <strong className="font-semibold text-card-foreground">{answers.toLocaleString()}</strong> answers in {WEEKS} weeks
        </span>
        <span className="inline-flex items-center gap-1" aria-label="Scale: answers per day">
          Fewer
          <span className={`h-3 w-3 rounded-[3px] ${EMPTY}`} title="None" />
          {BINS.map((b) => <span key={b.label} className={`h-3 w-3 rounded-[3px] ${b.cls}`} title={`${b.label} answers`} />)}
          More
        </span>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Show as a table</summary>
        {inRange.length === 0 ? (
          <p className="mt-2 text-muted-foreground">No study days in this period yet.</p>
        ) : (
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">Answers per study day, last {WEEKS} weeks</caption>
            <thead className="text-muted-foreground">
              <tr><th className="py-1 pr-2 font-medium">Day</th><th className="py-1 pr-2 text-right font-medium">Answers</th><th className="py-1 text-right font-medium">Correct</th></tr>
            </thead>
            <tbody>
              {[...inRange].reverse().map((a) => (
                <tr key={a.day} className="border-t border-border/70">
                  <td className="py-1 pr-2">{fmt(a.day)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{a.answered}</td>
                  <td className="py-1 text-right tabular-nums">{Math.round((100 * a.correct) / a.answered)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}
