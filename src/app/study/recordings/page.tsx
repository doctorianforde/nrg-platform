import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordingsLibrary } from "@/components/recordings/RecordingsLibrary";
import { fmtLength, KIND_LABEL, listRecordings } from "@/lib/recordings/queries";
import { loadStudentAnalytics } from "@/lib/analytics/student";

export const dynamic = "force-dynamic";

/** Recordings library (2026-11-09): past recordings and lectures, paid plans with free samples. */
export default async function RecordingsPage() {
  const { user, profile } = await requireRole("student", "/study/recordings");
  const staff = hasAtLeast(profile.role, "teacher");
  const paid = profile.subscription_tier !== "free";
  const [list, analytics] = await Promise.all([
    listRecordings(user.id, paid, staff),
    staff ? Promise.resolve(null) : loadStudentAnalytics(user.id, { stamina: false }).catch(() => null),
  ]);
  const weak = new Set((analytics?.weakTopics ?? []).map((t) => t.slug));
  const anyLocked = (list ?? []).some((r) => !r.playable);

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Recordings"
      eyebrow="Study"
      subtitle="Past recordings and lectures, each linked to its topic review and practice questions."
      protect={false}
    >
      {staff ? (
        <p className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-card-foreground">
          You see drafts too. <Link href="/teacher/recordings" className="font-medium text-brand-700 underline">Add or edit recordings</Link>
        </p>
      ) : anyLocked ? (
        <p className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-card-foreground">
          On the free plan you can watch the free samples. <Link href="/plans" className="font-medium text-brand-700 underline">See plans</Link> to watch them all.
        </p>
      ) : null}
      {list === null ? (
        <EmptyState title="Recordings aren't available yet" body="The recordings library is being set up. Check back soon." />
      ) : list.length === 0 ? (
        <EmptyState title="No recordings yet" body="Recordings appear here once your teachers publish them." />
      ) : (
        <RecordingsLibrary
          staff={staff}
          items={list.map((r) => ({
            slug: r.slug, title: r.title, kind: r.kind, kindLabel: KIND_LABEL[r.kind], presenter: r.presenter, description: r.description,
            durationSeconds: r.durationSeconds, length: fmtLength(r.durationSeconds), thumbnailUrl: r.thumbnailUrl, freeSample: r.freeSample,
            draft: r.status === "draft", publishedAt: r.publishedAt, domain: r.domain ? { code: r.domain.code, name: r.domain.name } : null,
            reviews: r.reviews, watched: !!r.progress?.watched, playable: r.playable,
            progressPct: r.progress ? Math.min(100, Math.round((100 * r.progress.furthestSeconds) / r.durationSeconds)) : null,
            focus: r.reviews.some((v) => weak.has(v.slug)),
          }))}
        />
      )}
    </DashboardShell>
  );
}
