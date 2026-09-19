import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { canManageSet, fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { removeQuestion } from "./actions";
import { ReleaseRationalesForm } from "./ReleaseRationalesForm";
import { QuestionSearch } from "./QuestionSearch";

export const dynamic = "force-dynamic";

export default async function ManageMockExamSetPage({
  params,
}: {
  params: { id: string };
}) {
  const { user, profile } = await requireRole("teacher", `/teacher/mock-exams/${params.id}`);
  const supabase = createClient();

  const { data: set } = await supabase
    .from("mock_exam_sets")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!set || !canManageSet(profile, set)) notFound();

  const [{ data: setQuestions }, { data: sessions }] = await Promise.all([
    supabase
      .from("mock_exam_set_questions")
      .select("display_order, questions(id, body, question_type, cognitive_level, difficulty, is_active)")
      .eq("set_id", set.id),
    supabase
      .from("mock_exam_sessions")
      .select("id, started_at, completed_at, score_pct, correct_count, total_questions")
      .eq("set_id", set.id)
      .order("started_at", { ascending: false }),
  ]);

  const questions = (setQuestions ?? [])
    .map((row) => ({ order: row.display_order, question: row.questions }))
    .filter((r): r is { order: number; question: NonNullable<typeof r.question> } => Boolean(r.question))
    .sort((a, b) => a.order - b.order);

  const released = set.rationale_released_at != null;

  return (
    <DashboardShell profile={profile} email={user.email} title={set.title}>
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{set.title}</CardTitle>
                {set.is_active ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="gray">Inactive</Badge>
                )}
              </div>
              {set.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{set.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {questions.length} question{questions.length === 1 ? "" : "s"} · created{" "}
                {fmtDateTime(set.created_at)}
              </p>
              <div className="mt-3">
                {released ? (
                  <p className="text-sm text-card-foreground">
                    <Badge tone="green">Rationales released</Badge>{" "}
                    <span className="text-muted-foreground">
                      Released {fmtDateTime(set.rationale_released_at)} (ask an admin to re-lock)
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <Badge tone="amber">Rationales locked</Badge> Students see no explanations or
                    option rationales until you release them.
                  </p>
                )}
              </div>
            </div>
            {!released ? <ReleaseRationalesForm setId={set.id} /> : null}
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <Card>
              <CardTitle className="mb-3">Questions in this set</CardTitle>
              {questions.length === 0 ? (
                <EmptyState
                  title="No questions yet"
                  body="Search the question bank on the right to add questions."
                />
              ) : (
                <ol className="space-y-3">
                  {questions.map(({ order, question: q }) => (
                    <li
                      key={q.id}
                      className="flex items-start gap-3 rounded-md border border-border p-3"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <QuestionMetaBadges meta={q} />
                          {!q.is_active ? <Badge tone="red">Inactive</Badge> : null}
                        </div>
                        <p className="line-clamp-3 text-sm text-card-foreground">{q.body}</p>
                      </div>
                      <form action={removeQuestion}>
                        <input type="hidden" name="set_id" value={set.id} />
                        <input type="hidden" name="question_id" value={q.id} />
                        <button
                          type="submit"
                          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card>
              <CardTitle className="mb-3">Sessions</CardTitle>
              {(!sessions || sessions.length === 0) ? (
                <EmptyState title="No attempts yet" body="Sessions appear here once students start this exam." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Started</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2 pr-4 text-muted-foreground">{fmtDateTime(s.started_at)}</td>
                          <td className="py-2 pr-4">
                            {s.completed_at ? (
                              <Badge tone="green">Completed</Badge>
                            ) : (
                              <Badge tone="blue">In progress</Badge>
                            )}
                          </td>
                          <td className="py-2 text-card-foreground">
                            {s.completed_at
                              ? `${fmtPct(s.score_pct)} (${s.correct_count ?? 0}/${s.total_questions ?? "?"})`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Student names aren&apos;t shown — profiles are only readable by their owner or an admin.
                  </p>
                </div>
              )}
            </Card>
          </div>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardTitle className="mb-3">Add questions</CardTitle>
              <QuestionSearch setId={set.id} existingIds={questions.map((q) => q.question.id)} />
            </Card>
          </aside>
        </div>

        <Link
          href="/teacher/mock-exams"
          className="inline-block rounded-md border border-border bg-card px-5 py-2 text-sm font-medium text-card-foreground hover:bg-muted"
        >
          ← Back to mock exams
        </Link>
      </div>
    </DashboardShell>
  );
}
