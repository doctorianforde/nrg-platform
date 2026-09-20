export type ThreadStatus = "open" | "answered" | "closed";

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  open: "Awaiting reply",
  answered: "Answered",
  closed: "Closed",
};

export const STATUS_TONE: Record<ThreadStatus, "amber" | "green" | "gray"> = {
  open: "amber",
  answered: "green",
  closed: "gray",
};

export type CitedAttempt = {
  sessionId: string;
  title: string;
  scorePct: number | null;
  completedAt: string | null;
};

export type ThreadSummary = {
  id: string;
  studentId: string;
  subject: string;
  status: ThreadStatus;
  createdAt: string;
  lastMessageAt: string;
  unread: boolean;
  /** Display name of the other party, or null when they have no name set. */
  counterpartName: string | null;
  attempt: CitedAttempt | null;
};

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  fromStaff: boolean;
  mine: boolean;
};

/**
 * Whether this side has messages they haven't seen.
 *
 * Posting stamps the author's own read marker (trg_touch_message_thread), so a
 * thread whose newest message is later than your marker always means the other
 * side spoke last and you haven't opened it since.
 */
export function hasUnread(
  thread: { last_message_at: string; student_last_read_at: string | null; staff_last_read_at: string | null },
  viewingAsStaff: boolean
): boolean {
  const lastRead = viewingAsStaff ? thread.staff_last_read_at : thread.student_last_read_at;
  if (!lastRead) return true;
  return Date.parse(thread.last_message_at) > Date.parse(lastRead);
}
