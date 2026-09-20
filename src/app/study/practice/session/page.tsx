import { requireRole } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";
import { fetchQuizQuestions } from "@/lib/quiz/fetch";
import { TutorSession } from "@/components/questions/TutorSession";
import { recordPracticeSession } from "@/lib/xp/actions";

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
  const count = Math.min(int(sp.count) ?? 10, 100);

  const questions = await fetchQuizQuestions({
    domainId: int(sp.domain),
    topicId: int(sp.topic),
    cognitive: typeof sp.cognitive === "string" && sp.cognitive ? sp.cognitive : null,
    difficulty: typeof sp.difficulty === "string" && sp.difficulty ? sp.difficulty : null,
    limit: count,
  });

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
        title={scope > 0 ? "Filtered practice" : "Mixed practice"}
        backHref="/study/practice"
        backLabel="Change filters"
        onComplete={async (total, correct) => {
          "use server";
          await recordPracticeSession(total, correct, int(sp.domain));
        }}
      />
    </DashboardShell>
  );
}
