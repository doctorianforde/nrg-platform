import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { listReviews } from "@/lib/topic-reviews/queries";
import { getAllowance } from "@/lib/tier/allowance";

export const dynamic = "force-dynamic";

export default async function TopicReviewsPage() {
  const { user, profile } = await requireRole("student", "/study/reviews");
  const staff = hasAtLeast(profile.role, "teacher");
  const [reviews, allowance] = await Promise.all([listReviews(), getAllowance()]);
  const openedToday = reviews.find((r) => r.openedToday);
  const drafts = reviews.filter((r) => r.status === "draft").length;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Topic reviews"
      eyebrow="Study"
      subtitle="High-yield reviews built the RENR way: normal function, what goes wrong, assessment, management, the care plan and how the exam tests it."
    >
      {staff && drafts > 0 ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {drafts} of {reviews.length} reviews are drafts that students can&apos;t see yet. Open one to read it through and publish it.
        </p>
      ) : null}
      {allowance.limited && reviews.length > 0 ? (
        <p className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-card-foreground">
          {openedToday ? (
            <>Today&apos;s free review: <strong>{openedToday.title}</strong>. A new one opens tomorrow — or upgrade to read them all.</>
          ) : (
            <>On the free plan you can open one topic review a day, for 5 minutes. Pick the one you need most.</>
          )}
        </p>
      ) : null}
      {reviews.length === 0 ? (
        <EmptyState title="No topic reviews yet" body="Reviews appear here once your teacher publishes them." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <Link key={r.slug} href={`/study/reviews/${r.slug}`} prefetch={false} className="group">
              <Card interactive className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{r.system}</span>
                  {staff ? (
                    <Badge tone={r.status === "published" ? "green" : "amber"} dot>
                      {r.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  ) : r.read ? (
                    <Badge tone="green" dot>Read</Badge>
                  ) : null}
                </div>
                <h3 className="mt-3 font-heading text-base font-semibold text-card-foreground transition-colors group-hover:text-primary">
                  {r.title}{" "}
                  <span className="inline-block transition-transform duration-200 group-hover:translate-x-1">→</span>
                </h3>
                <p className="mt-auto pt-3 text-xs text-muted-foreground">8 sections + a practice question · 10–15 min</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
