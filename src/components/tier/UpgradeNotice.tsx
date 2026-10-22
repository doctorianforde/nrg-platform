import { cn } from "@/lib/cn";

/** Shown to free-tier students where a limit applies. There is no checkout yet, so it says how to get upgraded. */
export function UpgradeNotice({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-sm motion-safe:animate-rise-in",
        className
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400 opacity-70"
      />
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 ring-1 ring-brand-200/60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold text-card-foreground">{title}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;re on the free plan. Standard and Premium include unlimited practice, mock exams and case studies —
            ask your teacher or NRG to upgrade your account.
          </p>
        </div>
      </div>
    </section>
  );
}
