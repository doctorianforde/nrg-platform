import { cn } from "@/lib/cn";

export function Card({
  className,
  id,
  interactive = false,
  children,
}: {
  className?: string;
  /** Set when a card needs to be an anchor target. */
  id?: string;
  /** Lifts gently on hover — for cards that are links or wrap one. */
  interactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-xl border border-border/80 bg-card p-5 shadow-sm",
        interactive && "card-lift",
        className
      )}
    >
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
