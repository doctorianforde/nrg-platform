import { requireRole } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";
import { fetchQuizQuestions } from "@/lib/quiz/fetch";
import { TutorSession } from "@/components/questions/TutorSession";
import { recordPracticeAnswers, recordPracticeSession } from "@/lib/xp/actions";
import { flags } from "@/lib/flags";
import { getAllowance } from "@/lib/tier/allowance";
import { dailyQuestionDue } from "@/lib/grading/daily";
import { DailyQuestionGate } from "@/components/grading/DailyQuestionGate";
import { UpgradeNotice } from "@/components/tier/UpgradeNotice";
import { getReview, publishedReviewLinks, reviewQuestionIds } from "@/lib/topic-reviews/queries";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const int = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export default async function PracticeSessionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { user, profile } = await requireRole("student", "/study/practice/session");
  const sp = searchParams;
  const [allowance, due] = await Promise.all([getAllowance(), dailyQuestionDue()]);
  if (due) {
    return (
      <DashboardShell profile={profile} email={user.email} title="Practice session" eyebrow="Tutor mode">
        <DailyQuestionGate />
      </DashboardShell>
    );
  }
  // Free tier: never serve more questions than are left today (the reveal step enforces it either way).
  const count = Math.min(int(sp.count) ?? 10, 100, allowance.limited ? allowance.remaining ?? 0 : 100);

  if (count === 0) {
    return (
      <DashboardShell
        profile={profile}
        email={user.email}
        title="Practice session"
        eyebrow="Tutor mode"
        subtitle="Instant feedback with explanations and option rationales after every answer."
      >
        <UpgradeNotice
          className="mx-auto max-w-3xl"
          title="That's today's free practice done"
          body={`You've answered your ${allowance.limit} free questions for today. Your allowance resets at midnight (Trinidad time).`}
        />
      </DashboardShell>
    );
  }

  // From a topic review's "Practise" button: questions that belong to that review instead of the filters.
  const reviewSlug = typeof sp.review === "string" ? sp.review : null;
  const review = reviewSlug ? await getReview(reviewSlug) : null;
  const reviewIds = review ? (await reviewQuestionIds(review)).slice(0, count) : null;

  const loadQuestions = () => {
    if (reviewIds) return reviewIds.length ? fetchQuizQuestions({ ids: reviewIds, limit: count }) : Promise.resolve([]);
    return fetchQuizQuestions({
      domainId: int(sp.domain),
      topicId: int(sp.topic),
      cognitive: typeof sp.cognitive === "string" && sp.cognitive ? sp.cognitive : null,
      difficulty: typeof sp.difficulty === "string" && sp.difficulty ? sp.difficulty : null,
      limit: count,
    });
  };
  const [questions, reviewLinks] = await Promise.all([loadQuestions(), publishedReviewLinks()]);

  const scope = [
    int(sp.domain) ? "domain" : null,
    int(sp.topic) ? "topic" : null,
    typeof sp.cognitive === "string" && sp.cognitive ? "level" : null,
    typeof sp.difficulty === "string" && sp.difficulty ? "difficulty" : null,
  ].filter(Boolean).length;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Practice session"
      eyebrow="Tutor mode"
      subtitle="Instant feedback with explanations and option rationales after every answer."
    >
      <TutorSession
        questions={questions}
        title={review ? review.title : scope > 0 ? "Filtered practice" : "Mixed practice"}
        backHref={review ? `/study/reviews/${review.slug}` : "/study/practice"}
        backLabel={review ? "Back to the topic review" : "Change filters"}
        reviewLinks={reviewLinks}
        finishLink={{ href: "/study/submit?from=practice", label: "Write a question on the topic you found hardest →" }}
        onComplete={async (total, correct, answers) => {
          "use server";
          // Ranking v2 sends the choices for the server to grade; with the flag off, the original tally path runs.
          if (flags.rankingV2) await recordPracticeAnswers(answers, int(sp.domain));
          else await recordPracticeSession(total, correct, int(sp.domain));
        }}
      />
    </DashboardShell>
  );
}
