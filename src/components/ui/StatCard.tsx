import { cn } from "@/lib/cn";

const TINTS = {
  purple: "bg-brand-100 text-brand-700 ring-brand-200/60",
  green: "bg-green-100 text-green-700 ring-green-200/60",
  amber: "bg-amber-100 text-amber-700 ring-amber-200/60",
  blue: "bg-blue-100 text-blue-700 ring-blue-200/60",
  red: "bg-red-100 text-red-700 ring-red-200/60",
} as const;

export type StatIconTone = keyof typeof TINTS;

/** Dashboard stat tile: tinted icon square, gray label, large bold value, optional hint/delta caption below.
 *  A hairline brand accent along the top ties the tiles to the page-header band. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  iconTone = "purple",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  iconTone?: StatIconTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-sm",
        className
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400 opacity-70"
      />
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
              TINTS[iconTone]
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
      </div>
      <div className="tabular-nums mt-3 font-heading text-3xl font-bold tracking-tight text-card-foreground">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
