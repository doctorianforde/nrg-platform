import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { STATUS_LABEL, type ReviewStatus } from "@/lib/review/filters";
import { hasUnread } from "@/lib/messages/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ReviewStatus, "blue" | "green" | "amber" | "red"> = {
  pending: "blue",
  approved: "green",
  needs_changes: "amber",
  rejected: "red",
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
);

const CheckCircleIcon = () => (
  <Icon>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </Icon>
);

const AlertIcon = () => (
  <Icon>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
);

const XCircleIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </Icon>
);

const STATUS_ICON: Record<ReviewStatus, () => React.ReactElement> = {
  pending: ClockIcon,
  approved: CheckCircleIcon,
  needs_changes: AlertIcon,
  rejected: XCircleIcon,
};

export default async function Page() {
  const { user, profile } = await requireRole("teacher", "/teacher");
  const supabase = createClient();

  const { count: pending } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_ai_generated", true)
    .eq("review_status", "pending");

  const { data: threadRows } = await supabase
    .from("message_threads")
    .select("last_message_at, staff_last_read_at, student_last_read_at")
    .order("last_message_at", { ascending: false })
    .limit(200);
  const unreadMessages = (threadRows ?? []).filter((t) => hasUnread(t, true)).length;

  const [approved, needsChanges, rejected] = await Promise.all(
    (["approved", "needs_changes", "rejected"] as const).map((status) =>
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("is_ai_generated", true)
        .eq("review_status", status)
        .then((r) => r.count ?? 0)
    )
  );

  const stats: { status: ReviewStatus; count: number }[] = [
    { status: "pending", count: pending ?? 0 },
    { status: "approved", count: approved },
    { status: "needs_changes", count: needsChanges },
    { status: "rejected", count: rejected },
  ];

  const quickLinks = [
    {
      href: "/teacher/review",
      title: "Review queue",
      body: "Work through the AI-generated questions waiting for clinical review.",
    },
    {
      href: "/teacher/messages",
      title: "Student messages",
      body: "Questions students have sent you, with the exam results they refer to.",
    },
    {
      href: "/teacher/mock-exams",
      title: "Mock exams",
      body: "Build exam sets and release rationales when your cohort is ready.",
    },
    {
      href: "/study",
      title: "Back to Study",
      body: "Return to the student study lobby and practice modes.",
    },
  ];

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Teacher dashboard"
      eyebrow="Instructor Portal"
      subtitle="Review AI-generated questions and manage mock exams for your cohort."
    >
      <Link
        href="/teacher/review"
        className="mb-4 block rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5 hover:border-[hsl(270,60%,35%)]"
      >
        <span className="font-medium text-[hsl(270,60%,35%)]">Review AI-generated questions →</span>
        <span className="mt-1 block text-sm text-gray-600">
          {(pending ?? 0).toLocaleString()} question{pending === 1 ? "" : "s"} waiting for review
        </span>
      </Link>

      {unreadMessages > 0 ? (
        <Link
          href="/teacher/messages"
          className="mb-4 block rounded-lg border border-brand-200 bg-brand-50 p-5 hover:border-brand-500"
        >
          <span className="font-medium text-brand-800">
            {unreadMessages.toLocaleString()} unread student{" "}
            {unreadMessages === 1 ? "message" : "messages"} →
          </span>
          <span className="mt-1 block text-sm text-brand-700">
            Students are waiting on your feedback.
          </span>
        </Link>
      ) : null}

      {needsChanges > 0 ? (
        <Link
          href="/teacher/review?status=needs_changes"
          className="mb-4 block rounded-lg border border-amber-300 bg-amber-50 p-5 hover:border-amber-500"
        >
          <span className="font-medium text-amber-800">
            {needsChanges.toLocaleString()} question{needsChanges === 1 ? "" : "s"} flagged needs
            changes →
          </span>
          <span className="mt-1 block text-sm text-amber-700">
            These were sent back for rework — revisit them before the queue grows.
          </span>
        </Link>
      ) : null}

      <h2 className="mb-3 font-heading text-lg font-semibold">AI review queue</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ status, count }) => {
          const StatusIcon = STATUS_ICON[status];
          return (
            <StatCard
              key={status}
              label={STATUS_LABEL[status]}
              value={count.toLocaleString()}
              icon={<StatusIcon />}
              iconTone={STATUS_TONE[status]}
            />
          );
        })}
      </div>

      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold">Quick links</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((l) => (
          <Link key={l.href} href={l.href} className="group">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardTitle className="group-hover:text-primary">{l.title} →</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{l.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </DashboardShell>
  );
}
