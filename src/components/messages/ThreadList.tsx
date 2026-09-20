import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtDateTime } from "@/lib/mock-exam/utils";
import { STATUS_LABEL, STATUS_TONE, type ThreadSummary } from "@/lib/messages/types";

export function ThreadList({
  threads,
  basePath,
  showWho,
  emptyTitle,
  emptyBody,
}: {
  threads: ThreadSummary[];
  /** Thread links are `${basePath}/${id}`. */
  basePath: string;
  /** Staff inboxes name the student; a student's own list doesn't need to. */
  showWho: boolean;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (threads.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <ul className="divide-y divide-border">
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={`${basePath}/${t.id}`} className="block px-1 py-3 hover:bg-brand-50/40">
            <div className="flex flex-wrap items-center gap-2">
              {t.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" /> : null}
              <span className={`text-sm ${t.unread ? "font-semibold text-card-foreground" : "text-card-foreground"}`}>
                {t.subject}
              </span>
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              {t.attempt ? <Badge tone="blue">{t.attempt.title}</Badge> : null}
              <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(t.lastMessageAt)}</span>
            </div>
            {showWho ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t.counterpartName ?? "Student"}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
