import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RecordingPlayer } from "@/components/recordings/RecordingPlayer";
import { fmtLength, getRecording, KIND_LABEL, listRecordings, playbackUrl } from "@/lib/recordings/queries";

export const dynamic = "force-dynamic";

/** Watch page (2026-11-09): player with chapters and tabs, plus links to the topic review, practice and related recordings. */
export default async function RecordingPage({ params }: { params: { slug: string } }) {
  const { user, profile } = await requireRole("student", `/study/recordings/${params.slug}`);
  const staff = hasAtLeast(profile.role, "teacher");
  const paid = profile.subscription_tier !== "free";
  const rec = await getRecording(params.slug, user.id, paid, staff);
  if (!rec) notFound();
  const [src, all] = await Promise.all([rec.playable ? playbackUrl(rec.id) : Promise.resolve(null), listRecordings(user.id, paid, staff)]);
  const related = (all ?? [])
    .filter((r) => r.id !== rec.id && (r.reviews.some((v) => rec.reviews.some((w) => w.slug === v.slug)) || (rec.domain && r.domain?.id === rec.domain.id)))
    .slice(0, 3);
  const firstReview = rec.reviews[0];
  const practiseHref = firstReview
    ? `/study/practice/session?review=${firstReview.slug}&count=10`
    : rec.domain ? `/study/practice/session?domain=${rec.domain.id}&count=10` : "/study/practice";

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title={rec.title}
      eyebrow={`Recording · ${KIND_LABEL[rec.kind]}`}
      subtitle={[rec.presenter, fmtLength(rec.durationSeconds), rec.domain?.name].filter(Boolean).join(" · ")}
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {staff && rec.status === "draft" ? <p className="mb-3"><Badge tone="amber" dot>Draft: students can&apos;t see this yet</Badge></p> : null}
          {src ? (
            <RecordingPlayer
              recordingId={rec.id}
              src={src}
              durationSeconds={rec.durationSeconds}
              resumeAt={rec.progress?.positionSeconds ?? 0}
              chapters={rec.chapters}
              transcript={rec.transcript}
              notes={rec.notes}
              watermark={staff ? null : `${profile.full_name ?? "NRG student"} · ${user.email ?? user.id}`}
              saveProgress={!staff}
            />
          ) : rec.playable ? (
            <Card><p className="text-sm text-muted-foreground">This recording can&apos;t be played right now. Reload the page, and if it keeps happening, tell your teacher.</p></Card>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
              {rec.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rec.thumbnailUrl} alt="" className="aspect-video w-full max-w-full object-cover opacity-40 grayscale" />
              ) : <div className="aspect-video w-full bg-muted" />}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="font-heading text-lg font-semibold text-card-foreground">This recording is for students on a paid plan</p>
                <p className="max-w-md text-sm text-muted-foreground">The 1-month and 3-month plans include every recording, plus unlimited practice, mock exams and case studies.</p>
                <Link href="/plans" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover">See plans</Link>
              </div>
            </div>
          )}
          {rec.description ? <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{rec.description}</p> : null}
        </div>

        <aside className="space-y-4">
          <Card className="border-brand-200">
            <CardTitle className="text-sm">Put it into practice</CardTitle>
            {rec.reviews.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {rec.reviews.map((r) => (
                  <li key={r.slug}><Link href={`/study/reviews/${r.slug}`} prefetch={false} className="font-medium text-brand-700 hover:underline">Review: {r.title}</Link></li>
                ))}
              </ul>
            ) : null}
            <Link href={practiseHref} prefetch={false} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover">
              Practise 10 questions
            </Link>
          </Card>
          {rec.progress?.watched ? <Card><Badge tone="green" dot>Watched</Badge></Card> : null}
          {related.length ? (
            <Card>
              <CardTitle className="text-sm">Related recordings</CardTitle>
              <ul className="mt-2 space-y-2 text-sm">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/study/recordings/${r.slug}`} prefetch={false} className="font-medium text-card-foreground hover:text-primary">{r.title}</Link>
                    <span className="block text-xs text-muted-foreground">{KIND_LABEL[r.kind]} · {fmtLength(r.durationSeconds)}{r.playable ? "" : " · paid plans"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Link href="/study/recordings" className="block text-center text-xs font-medium text-brand-700 underline">All recordings</Link>
        </aside>
      </div>
    </DashboardShell>
  );
}
