import { cn } from "@/lib/cn";

export function Card({
  className,
  id,
  children,
}: {
  className?: string;
  /** Set when a card needs to be an anchor target. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className={cn("rounded-lg border border-border bg-card p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h2 className={cn("font-heading font-semibold text-card-foreground", className)}>{children}</h2>;
}
