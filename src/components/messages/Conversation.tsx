import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { STATUS_LABEL, STATUS_TONE, type ThreadMessage, type ThreadSummary } from "@/lib/messages/types";
import { Composer } from "./Composer";

function Bubble({ message }: { message: ThreadMessage }) {
  return (
    <li className={message.mine ? "flex justify-end" : "flex justify-start"}>
      <div className={`max-w-[42rem] rounded-2xl px-4 py-3 ${
        message.mine
          ? "bg-brand-700 text-white"
          : message.fromStaff
            ? "border border-brand-200 bg-brand-50 text-card-foreground"
            : "border border-border bg-card text-card-foreground"
      }`}
      >
        <div className={`flex flex-wrap items-baseline gap-2 text-xs ${message.mine ? "text-white/70" : "text-muted-foreground"}`}>
          <span className="font-medium">{message.mine ? "You" : message.authorName}</span>
          {!message.mine && message.fromStaff ? (
            <span className="rounded-full bg-brand-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-800">
              Teacher
            </span>
          ) : null}
          <span>{fmtDateTime(message.createdAt)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
      </div>
    </li>
  );
}

/**
 * One conversation. Used by both sides; `canReply` is false once a thread is
 * closed, which the database also enforces on insert.
 */
export function Conversation({
  thread,
  messages,
  attemptHref,
  placeholder,
}: {
  thread: ThreadSummary;
  messages: ThreadMessage[];
  /** Where the cited attempt links to — differs for students and staff. */
  attemptHref?: string;
  placeholder: string;
}) {
  const canReply = thread.status !== "closed";

  return (
    <Card className="rounded-xl border-brand-100">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-card-foreground">{thread.subject}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {thread.counterpartName ? `With ${thread.counterpartName} · ` : ""}
            Started {fmtDateTime(thread.createdAt)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[thread.status]}>{STATUS_LABEL[thread.status]}</Badge>
      </div>

      {thread.attempt ? (
        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
            About this attempt
          </p>
          <p className="mt-1 text-sm text-card-foreground">
            {thread.attempt.title} — scored {fmtPct(thread.attempt.scorePct)}
            {thread.attempt.completedAt ? ` on ${fmtDateTime(thread.attempt.completedAt)}` : ""}
          </p>
          {attemptHref ? (
            <a href={attemptHref} className="mt-1 inline-block text-xs font-medium text-brand-700 underline">
              Open the full result
            </a>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
      </ul>

      {canReply ? (
        <Composer threadId={thread.id} placeholder={placeholder} />
      ) : (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This conversation is closed.
        </p>
      )}
    </Card>
  );
}
