import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { fetchQuizQuestions } from "@/lib/quiz/fetch";
import { ExamRunner } from "./ExamRunner";
import { ResultsView } from "./ResultsView";
import { GroupStandings, type Standing } from "@/components/exam/GroupStandings";

export const dynamic = "force-dynamic";

export default async function MockExamSessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const { user, profile } = await requireRole(
    "student",
    `/study/mock-exams/session/${params.sessionId}`
  );
  const supabase = createClient();

  // A timed attempt whose deadline passed while the browser was shut gets closed
  // and scored here, so reloading the page shows results rather than a dead timer.
  await supabase.rpc("complete_expired_exam_sessions");

  const { data: session } = await supabase
    .from("mock_exam_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .maybeSingle();
  if (!session || session.student_id !== user.id) redirect("/study/mock-exams");

  const [{ data: set }, { data: setQuestions }, { data: responses }] = await Promise.all([
    supabase.from("mock_exam_sets").select("*").eq("id", session.set_id).maybeSingle(),
    supabase
      .from("mock_exam_set_questions")
      .select("question_id")
      .eq("set_id", session.set_id)
      .order("display_order"),
    supabase
      .from("mock_exam_responses")
      .select("question_id, selected_option_ids, is_correct, answered_at")
      .eq("session_id", session.id),
  ]);
  if (!set) redirect("/study/mock-exams");

  const ids = (setQuestions ?? []).map((r) => r.question_id);
  // Enforces is_active=true; inactive set questions silently drop out.
  const questions = await fetchQuizQuestions({ ids, preserveOrder: true });

  // For a group attempt, how everyone placed — scores only, never their answers.
  let standings: Standing[] | null = null;
  if (session.group_id) {
    const [{ data: roster }, { data: groupSessions }] = await Promise.all([
      supabase
        .from("exam_group_members")
        .select("student_id")
        .eq("group_id", session.group_id)
        .order("joined_at"),
      supabase
        .from("mock_exam_sessions")
        .select("student_id, score_pct, correct_count, total_questions, completed_at")
        .eq("group_id", session.group_id),
    ]);
    const ids = (roster ?? []).map((r) => r.student_id);
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    standings = (roster ?? []).map((r) => {
      const s = groupSessions?.find((x) => x.student_id === r.student_id);
      return {
        studentId: r.student_id,
        name: people?.find((p) => p.id === r.student_id)?.full_name?.trim() || "A classmate",
        scorePct: s?.score_pct ?? null,
        correct: s?.correct_count ?? null,
        total: s?.total_questions ?? null,
        completed: Boolean(s?.completed_at),
        isYou: r.student_id === user.id,
      };
    });
  }

  if (session.completed_at) {
    return (
      <DashboardShell
        profile={profile}
        email={user.email}
        title={`Results — ${set.title}`}
        eyebrow="Exam format"
        subtitle={
          set.rationale_released_at != null
            ? "Your teacher has released the rationales for this exam — review each question below."
            : "Real exam conditions — no feedback while answering. Rationales unlock after your teacher's class review."
        }
      >
        {standings ? (
          <div className="mb-5">
            <GroupStandings standings={standings} />
          </div>
        ) : null}
        <ResultsView
          setTitle={set.title}
          session={session}
          questions={questions}
          responses={(responses ?? []) as Array<{
            question_id: string;
            selected_option_ids: string[];
            is_correct: boolean | null;
            answered_at: string | null;
          }>}
          rationaleReleased={set.rationale_released_at != null}
          groupStillSitting={standings?.some((x) => !x.completed) ?? false}
        />
      </DashboardShell>
    );
  }

  // Sanitize before anything reaches the client: the exam runner must not
  // receive is_correct flags, option rationales, or explanations.
  const examQuestions = questions.map((q) => ({
    id: q.id,
    body: q.body,
    question_type: q.question_type,
    cognitive_level: q.cognitive_level,
    difficulty: q.difficulty,
    options: q.options.map((o) => ({
      id: o.id,
      body: o.body,
      display_order: o.display_order,
    })),
  }));
  const initialAnswers = Object.fromEntries(
    (responses ?? [])
      .filter((r) => r.selected_option_ids.length > 0)
      .map((r) => [r.question_id, r.selected_option_ids])
  );

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title={set.title}
      eyebrow="Exam format"
      subtitle="Real exam conditions — no feedback while you answer. Answers save automatically."
    >
      <ExamRunner
        sessionId={session.id}
        setTitle={set.title}
        questions={examQuestions}
        initialAnswers={initialAnswers}
        expiresAt={session.expires_at ?? null}
        groupId={session.group_id ?? null}
      />
    </DashboardShell>
  );
}
