import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReviewLibrary } from "@/components/topic-reviews/ReviewLibrary";
import { loadStudentAnalytics } from "@/lib/analytics/student";
import { listReviews } from "@/lib/topic-reviews/queries";
import { getAllowance } from "@/lib/tier/allowance";

export const dynamic = "force-dynamic";

export default async function TopicReviewsPage() {
  const { user, profile } = await requireRole("student", "/study/reviews");
  const staff = hasAtLeast(profile.role, "teacher");
  const [reviews, allowance, analytics] = await Promise.all([
    listReviews(),
    getAllowance(),
    // Students: reviews that match their weakest topics are marked "Focus area" (My progress).
    staff ? Promise.resolve(null) : loadStudentAnalytics(user.id, { stamina: false }).catch(() => null),
  ]);
  const focus = new Set((analytics?.weakTopics ?? []).map((t) => t.slug));
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
        <ReviewLibrary
          staff={staff}
          items={reviews.map((r) => ({
            slug: r.slug,
            title: r.title,
            system: r.system,
            keywords: r.keywords,
            status: r.status,
            read: r.read,
            sortOrder: r.sortOrder,
            focus: focus.has(r.slug),
          }))}
        />
      )}
    </DashboardShell>
  );
}
