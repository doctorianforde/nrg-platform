import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { ReviewSlides, SLIDE_ANCHOR } from "@/components/topic-reviews/ReviewSlides";
import { ReviewQuestionCard } from "@/components/topic-reviews/ReviewQuestionCard";
import { PublishControl } from "@/components/topic-reviews/PublishControl";
import { FreeReviewTimer, ReadTracker, StartFreeReview } from "@/components/topic-reviews/ReviewAccessControls";
import { UpgradeNotice } from "@/components/tier/UpgradeNotice";
import { createClient } from "@/lib/supabase/server";
import { getReview, listReviews, reviewAccess, reviewQuestionIds } from "@/lib/topic-reviews/queries";

export const dynamic = "force-dynamic";

const PRACTICE_SIZE = 10;

export default async function TopicReviewPage({ params }: { params: { slug: string } }) {
  const { user, profile } = await requireRole("student", `/study/reviews/${params.slug}`);
  const staff = hasAtLeast(profile.role, "teacher");

  // Null on a database without 20261022160000: no free-tier window and no reading XP, just the content.
  const access = await reviewAccess(params.slug);
  if (access && !access.exists) notFound();
  // A student on an unlimited plan opens the review by visiting it (that starts the reading clock). A free student
  // spends their daily review only by pressing Start, so a link or a prefetch can't use it up.
  if (access?.isStudent && !access.limited && !access.openedAt) {
    const { data } = await createClient().rpc("open_topic_review", { p_slug: params.slug });
    const opened = (data as { opened_at?: string } | null)?.opened_at;
    if (opened) access.openedAt = opened;
  }
  const expired = !!access?.expiresAt && Date.parse(access.expiresAt) <= Date.now();
  const locked = !!access?.limited && (!access.openedAt || expired);
  const review = locked ? null : await getReview(params.slug);
  if (!review) {
    const summary = (await listReviews()).find((r) => r.slug === params.slug);
    if (!summary || !access?.limited) notFound();
    return (
      <DashboardShell
        profile={profile}
        email={user.email}
        title={summary.title}
        eyebrow={`Topic review · ${summary.system}`}
        subtitle="Read it top to bottom in 10–15 minutes, then practise questions on this topic."
      >
        {access.quotaLeft ? (
          <Card className="mx-auto max-w-2xl border-brand-200">
            <CardTitle>Your free topic review for today</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              The free plan includes {access.perDay === 1 ? "one topic review" : `${access.perDay} topic reviews`} a day, for{" "}
              {access.minutes} minutes each. Read this one now?
            </p>
            <StartFreeReview slug={summary.slug} minutes={access.minutes} />
          </Card>
        ) : (
          <UpgradeNotice
            className="mx-auto max-w-2xl"
            title={access.openedAt ? `Your ${access.minutes} minutes with this review are up` : "You've used today's free topic review"}
            body={
              access.openedAt
                ? "Come back tomorrow for another free review, or upgrade to read every review as often as you like."
                : `The free plan includes ${access.perDay === 1 ? "one topic review" : `${access.perDay} topic reviews`} a day. A new one opens tomorrow (Trinidad time).`
            }
          />
        )}
        <p className="mt-4 text-center">
          <Link href="/study/reviews" prefetch={false} className="text-xs font-medium text-brand-700 underline">
            All topic reviews
          </Link>
        </p>
      </DashboardShell>
    );
  }

  const [all, questionIds] = await Promise.all([listReviews(), reviewQuestionIds(review)]);
  const related = review.related
    .map((s) => all.find((r) => r.slug === s))
    .filter((r): r is NonNullable<typeof r> => !!r && (staff || r.status === "published"));
  const practiceCount = Math.min(PRACTICE_SIZE, questionIds.length);

  const contents = [
    ...review.slides.map((s, i) => ({ href: `#${SLIDE_ANCHOR(s, i)}`, label: s.title })),
    ...(review.question ? [{ href: "#practice-question", label: "RENR practice question" }] : []),
  ];

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title={review.title}
      eyebrow={`Topic review · ${review.system}`}
      subtitle="Read it top to bottom in 10–15 minutes, then practise questions on this topic."
    >
      {staff ? <PublishControl slug={review.slug} status={review.status} /> : null}
      {access?.limited && access.expiresAt ? <FreeReviewTimer expiresAt={access.expiresAt} /> : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <ReviewSlides slides={review.slides} />

          {review.question ? (
            <section id="practice-question" className="mt-10 scroll-mt-24">
              <div className="mb-4 flex items-baseline gap-3 border-b border-border pb-2">
                <span className="font-mono text-xs font-semibold text-brand-500">{String(review.slides.length + 1).padStart(2, "0")}</span>
                <h2 className="font-heading text-xl font-semibold text-foreground">RENR practice question</h2>
              </div>
              <ReviewQuestionCard question={review.question} />
            </section>
          ) : null}

          {access?.isStudent ? (
            <ReadTracker
              slug={review.slug}
              openedAt={access.openedAt}
              minSeconds={access.minSeconds}
              xp={access.xp}
              xpLive={access.xpLive}
              alreadyRead={access.read}
            />
          ) : null}
          {access?.isStudent ? (
            <Link
              href={`/study/submit?review=${review.slug}`}
              prefetch={false}
              className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
            >
              <span>Now write your own question on {review.title}</span>
              <span aria-hidden>→</span>
            </Link>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <Card className="hidden lg:block">
            <CardTitle className="text-sm">In this review</CardTitle>
            <ol className="mt-3 space-y-1.5 text-sm">
              {contents.map((c, i) => (
                <li key={c.href}>
                  <a href={c.href} className="flex gap-2 text-muted-foreground transition-colors hover:text-primary">
                    <span className="font-mono text-xs text-brand-400">{String(i + 1).padStart(2, "0")}</span>
                    {c.label}
                  </a>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="border-brand-200">
            <CardTitle className="text-sm">Practise this topic</CardTitle>
            {practiceCount > 0 ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {questionIds.length} question{questionIds.length === 1 ? "" : "s"} in the bank on this topic.
                </p>
                <Link
                  href={`/study/practice/session?review=${review.slug}&count=${practiceCount}`}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
                >
                  Practise {practiceCount} question{practiceCount === 1 ? "" : "s"}
                </Link>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No live questions on this topic yet.</p>
            )}
          </Card>

          {related.length > 0 ? (
            <Card>
              <CardTitle className="text-sm">Related topics</CardTitle>
              <ul className="mt-3 flex flex-wrap gap-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/study/reviews/${r.slug}`}
                      prefetch={false}
                      className="inline-block rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100"
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Link href="/study/reviews" prefetch={false} className="block text-center text-xs font-medium text-brand-700 underline">
            All topic reviews
          </Link>
        </aside>
      </div>
    </DashboardShell>
  );
}
