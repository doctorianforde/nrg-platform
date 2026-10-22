import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { STATUS_LABEL, STUDENT_SOURCE, type ReviewStatus } from "@/lib/review/filters";
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

const MailIcon = () => (
  <Icon>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </Icon>
);

const ClipboardCheckIcon = () => (
  <Icon>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="m9 14 2 2 4-4" />
  </Icon>
);

const ArrowLeftIcon = () => (
  <Icon>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Icon>
);

const SparkIcon = () => (
  <Icon>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Icon>
);

const QUICK_LINK_ICONS: Record<string, () => React.ReactElement> = {
  "/teacher/generate": SparkIcon,
  "/teacher/review": CheckCircleIcon,
  "/teacher/messages": MailIcon,
  "/teacher/mock-exams": ClipboardCheckIcon,
  "/study/leaderboard": CheckCircleIcon,
  "/study": ArrowLeftIcon,
};

export default async function Page() {
  const { user, profile } = await requireRole("teacher", "/teacher");
  const supabase = createClient();

  const { count: pending } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .or(`is_ai_generated.eq.true,source.eq.${STUDENT_SOURCE}`)
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
        .or(`is_ai_generated.eq.true,source.eq.${STUDENT_SOURCE}`)
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
      href: "/teacher/generate",
      title: "Generate content",
      body: "Ask for new questions or case studies, in your own words or by domain, topic and taxonomy.",
    },
    {
      href: "/study/leaderboard",
      title: "Question writers' leaderboard",
      body: "Students ranked by approved questions (Template 3.8). Hidden from students until Jade switches it on.",
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
        className="card-lift relative mb-4 block overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-sm motion-safe:animate-rise-in"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-400 via-brand-600 to-brand-400"
        />
        <span className="flex items-start gap-3 pl-2">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 ring-1 ring-brand-200/60"
          >
            <ClockIcon />
          </span>
          <span className="min-w-0">
            <span className="font-heading font-semibold text-gradient-brand">
              Review AI-generated questions →
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {(pending ?? 0).toLocaleString()} question{pending === 1 ? "" : "s"} waiting for review
            </span>
          </span>
        </span>
      </Link>

      {unreadMessages > 0 ? (
        <Link
          href="/teacher/messages"
          className="card-lift mb-4 block rounded-xl border border-brand-200 bg-brand-50 p-5 shadow-sm"
        >
          <span className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 ring-1 ring-brand-200/60"
            >
              <MailIcon />
            </span>
            <span className="min-w-0">
              <span className="font-medium text-brand-800">
                {unreadMessages.toLocaleString()} unread student{" "}
                {unreadMessages === 1 ? "message" : "messages"} →
              </span>
              <span className="mt-1 block text-sm text-brand-700">
                Students are waiting on your feedback.
              </span>
            </span>
          </span>
        </Link>
      ) : null}

      {needsChanges > 0 ? (
        <Link
          href="/teacher/review?status=needs_changes"
          className="card-lift mb-4 block rounded-xl border border-amber-300/80 bg-amber-50 p-5 shadow-sm"
        >
          <span className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200/60"
            >
              <AlertIcon />
            </span>
            <span className="min-w-0">
              <span className="font-medium text-amber-800">
                {needsChanges.toLocaleString()} question{needsChanges === 1 ? "" : "s"} flagged needs
                changes →
              </span>
              <span className="mt-1 block text-sm text-amber-700">
                These were sent back for rework — revisit them before the queue grows.
              </span>
            </span>
          </span>
        </Link>
      ) : null}

      <h2 className="mb-3 font-heading text-lg font-semibold text-foreground">AI review queue</h2>
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

      <h2 className="mt-8 mb-3 font-heading text-lg font-semibold text-foreground">Quick links</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((l) => {
          const LinkIcon = QUICK_LINK_ICONS[l.href];
          return (
            <Link key={l.href} href={l.href} className="group">
              <Card interactive className="h-full">
                <span
                  aria-hidden
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700"
                >
                  {LinkIcon ? <LinkIcon /> : null}
                </span>
                <CardTitle className="transition-colors group-hover:text-primary">{l.title} →</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{l.body}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </DashboardShell>
  );
}
