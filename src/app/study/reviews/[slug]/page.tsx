import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { ReviewSlides, SLIDE_ANCHOR } from "@/components/topic-reviews/ReviewSlides";
import { ReviewQuestionCard } from "@/components/topic-reviews/ReviewQuestionCard";
import { PublishControl } from "@/components/topic-reviews/PublishControl";
import { getReview, listReviews, reviewQuestionIds } from "@/lib/topic-reviews/queries";

export const dynamic = "force-dynamic";

const PRACTICE_SIZE = 10;

export default async function TopicReviewPage({ params }: { params: { slug: string } }) {
  const { user, profile } = await requireRole("student", `/study/reviews/${params.slug}`);
  const review = await getReview(params.slug);
  if (!review) notFound();
  const staff = hasAtLeast(profile.role, "teacher");

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
                      className="inline-block rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100"
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Link href="/study/reviews" className="block text-center text-xs font-medium text-brand-700 underline">
            All topic reviews
          </Link>
        </aside>
      </div>
    </DashboardShell>
  );
}
