import { cn } from "@/lib/cn";

/** Dashboard stat tile: big value, small label, optional hint below. */
export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5 shadow-sm", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-3xl font-bold text-card-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
