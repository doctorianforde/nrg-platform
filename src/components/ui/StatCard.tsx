import { cn } from "@/lib/cn";

const TINTS = {
  purple: "bg-brand-100 text-brand-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
} as const;

export type StatIconTone = keyof typeof TINTS;

/** Dashboard stat tile, per the reference pattern: tinted icon square, gray label,
 *  large bold value, optional hint/delta caption below. */
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
    <div className={cn("rounded-lg border border-border bg-card p-5 shadow-sm", className)}>
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
              TINTS[iconTone]
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
      <div className="mt-2 font-heading text-3xl font-bold text-card-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
