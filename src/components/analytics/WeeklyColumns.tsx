/**
 * One series of weekly columns (brand fill, 0 at the baseline), for the class trends. Each column is focusable and
 * shows its value on hover or focus; an optional reference line (e.g. the mock pass mark); a table view carries every
 * value. Weeks with no data show an empty slot and "—" rather than a zero-height bar that reads as 0 %.
 */
export function WeeklyColumns({
  points,
  max,
  format,
  refLine,
  caption,
  unitLabel,
}: {
  points: { key: string; label: string; value: number | null; note?: string }[];
  /** Top of the scale. Defaults to the largest value. */
  max?: number;
  format: (v: number) => string;
  refLine?: { value: number; label: string };
  caption: string;
  unitLabel: string;
}) {
  const top = Math.max(1, max ?? Math.max(0, ...points.map((p) => p.value ?? 0)));
  return (
    <figure className="min-w-0">
      <div className="relative h-36">
        {refLine ? (
          <span
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-foreground/30"
            style={{ bottom: `${(refLine.value / top) * 100}%` }}
          >
            <span className="absolute -top-4 right-0 text-[10px] text-muted-foreground">{refLine.label}</span>
          </span>
        ) : null}
        <ol className="flex h-full items-end gap-1 border-b border-border">
          {points.map((p, i) => {
            // Keep the hover label on screen: edge columns anchor it inward.
            const anchor = i < points.length / 3 ? "left-0" : i >= (2 * points.length) / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            const tip = `${p.value === null ? "—" : format(p.value)} · week of ${p.label}${p.note ? ` · ${p.note}` : ""}`;
            return (
              <li
                key={p.key}
                tabIndex={0}
                aria-label={tip}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.value !== null ? (
                  <span
                    aria-hidden
                    className="block w-full max-w-7 rounded-t bg-brand-600 transition-[height] duration-500 group-hover:bg-brand-700"
                    style={{ height: `${Math.max((p.value / top) * 100, p.value > 0 ? 2 : 0)}%` }}
                  />
                ) : null}
                <span
                  role="presentation"
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 ${anchor} whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`}
                >
                  <strong className="font-semibold">{p.value === null ? "—" : format(p.value)}</strong>{" "}
                  <span className="text-muted-foreground">w/c {p.label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground" aria-hidden>
        {points.map((p, i) => (
          <span key={p.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">{(points.length - 1 - i) % 3 === 0 ? p.label : ""}</span>
        ))}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-muted-foreground">
            <tr><th className="py-1 pr-2 font-medium">Week of</th><th className="py-1 pr-2 text-right font-medium">{unitLabel}</th><th className="py-1 font-medium" /></tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-border/70">
                <td className="py-1 pr-2">{p.label}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{p.value === null ? "—" : format(p.value)}</td>
                <td className="py-1 text-muted-foreground">{p.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
