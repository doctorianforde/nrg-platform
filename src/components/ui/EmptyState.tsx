export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
      <span
        aria-hidden
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-400 ring-1 ring-brand-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6m16 0v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4m16 0h-5l-1.5 2h-3L9 13H4" />
        </svg>
      </span>
      <p className="font-heading font-semibold text-card-foreground">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
