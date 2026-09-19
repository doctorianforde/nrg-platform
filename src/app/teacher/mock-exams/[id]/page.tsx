import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { canManageSet, fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { removeQuestion } from "./actions";
import { ReleaseRationalesForm } from "./ReleaseRationalesForm";
import { QuestionSearch } from "./QuestionSearch";

export const dynamic = "force-dynamic";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

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
  const sessionList = sessions ?? [];
  const completed = sessionList.filter((s) => s.completed_at != null);
  const avgScore =
    completed.length > 0
      ? completed.reduce((n, s) => n + (s.score_pct ?? 0), 0) / completed.length
      : null;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title={set.title}
      eyebrow="Instructor Portal"
      subtitle={set.description ?? "Manage questions, review attempts, and control when rationales reach students."}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Questions" value={questions.length} />
          <StatCard label="Sessions started" value={sessionList.length} />
          <StatCard label="Completed attempts" value={completed.length} />
          <StatCard label="Average score" value={fmtPct(avgScore)} hint="Completed attempts only" />
        </div>

        <Card className="rounded-xl border-brand-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Rationale release</CardTitle>
                {released ? (
                  <Badge tone="green">Rationales released</Badge>
                ) : (
                  <Badge tone="amber">Rationales locked</Badge>
                )}
              </div>
              {released ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Released {fmtDateTime(set.rationale_released_at)}. Re-locking requires an admin —
                  ask an admin to re-lock.
                </p>
              ) : (
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  Students currently see no explanations or option rationales for this exam —
                  not even after submitting. Release is deliberate and one-way for teachers.
                </p>
              )}
            </div>
            {!released ? <ReleaseRationalesForm setId={set.id} /> : null}
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <Card className="rounded-xl border-brand-100">
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
                      className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-brand-200"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
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
                          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card className="rounded-xl border-brand-100">
              <CardTitle className="mb-3">Sessions</CardTitle>
              {sessionList.length === 0 ? (
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
                      {sessionList.map((s) => (
                        <tr key={s.id} className="transition-colors hover:bg-brand-50/40">
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
            <Card className="rounded-xl border-brand-100">
              <CardTitle className="mb-3">Add questions</CardTitle>
              <QuestionSearch setId={set.id} existingIds={questions.map((q) => q.question.id)} />
            </Card>
          </aside>
        </div>

        <Link
          href="/teacher/mock-exams"
          className="inline-block rounded-lg border-2 border-brand-700 px-5 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
        >
          ‹ Back to mock exams
        </Link>
      </div>
    </DashboardShell>
  );
}
