import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { STATUS_LABEL, type ReviewStatus } from "@/lib/review/filters";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ReviewStatus, string> = {
  pending: "text-gray-700",
  approved: "text-green-700",
  needs_changes: "text-amber-700",
  rejected: "text-red-700",
};

export default async function Page() {
  const { user, profile } = await requireRole("teacher", "/teacher");
  const supabase = createClient();

  const { count: pending } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("is_ai_generated", true)
    .eq("review_status", "pending");

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
    <DashboardShell profile={profile} email={user.email} title="Teacher dashboard">
      <Link
        href="/teacher/review"
        className="mb-4 block rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5 hover:border-[hsl(270,60%,35%)]"
      >
        <span className="font-medium text-[hsl(270,60%,35%)]">Review AI-generated questions →</span>
        <span className="mt-1 block text-sm text-gray-600">
          {(pending ?? 0).toLocaleString()} question{pending === 1 ? "" : "s"} waiting for review
        </span>
      </Link>

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
        {stats.map(({ status, count }) => (
          <StatCard
            key={status}
            label={STATUS_LABEL[status]}
            value={<span className={STATUS_TONE[status]}>{count.toLocaleString()}</span>}
          />
        ))}
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
