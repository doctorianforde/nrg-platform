import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { StartExamForm } from "./StartExamForm";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  set_id: string;
  started_at: string;
  completed_at: string | null;
  score_pct: number | null;
};

export default async function MockExamsPage() {
  const { user, profile } = await requireRole("student", "/study/mock-exams");
  const supabase = createClient();

  const [{ data: sets }, { data: sessions }] = await Promise.all([
    supabase
      .from("mock_exam_sets")
      .select("id, title, description, rationale_released_at, mock_exam_set_questions(question_id)")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("mock_exam_sessions")
      .select("id, set_id, started_at, completed_at, score_pct")
      .eq("student_id", user.id)
      .order("started_at", { ascending: false }),
  ]);

  const sessionsBySet = new Map<string, SessionRow[]>();
  for (const s of (sessions ?? []) as SessionRow[]) {
    const list = sessionsBySet.get(s.set_id) ?? [];
    list.push(s);
    sessionsBySet.set(s.set_id, list);
  }

  return (
    <DashboardShell profile={profile} email={user.email} title="Mock exams">
      <p className="mb-5 text-sm text-muted-foreground">
        Mock exams run in real exam format: no feedback while you answer, and no
        explanations until your teacher releases them after class review.
      </p>
      {(!sets || sets.length === 0) ? (
        <EmptyState title="No mock exams available yet" body="Your teacher hasn't published any exam sets." />
      ) : (
        <div className="space-y-4">
          {sets.map((set) => {
            const past = sessionsBySet.get(set.id) ?? [];
            const released = set.rationale_released_at != null;
            const count = set.mock_exam_set_questions?.length ?? 0;
            return (
              <Card key={set.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{set.title}</CardTitle>
                    {set.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{set.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{count} question{count === 1 ? "" : "s"}</span>
                      {released ? (
                        <Badge tone="green">Rationales released</Badge>
                      ) : (
                        <Badge tone="amber">Rationales locked</Badge>
                      )}
                    </div>
                  </div>
                  <StartExamForm setId={set.id} />
                </div>
                {past.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Your attempts
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {past.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {s.completed_at ? (
                            <>
                              <span className="font-medium text-card-foreground">
                                Score: {fmtPct(s.score_pct)}
                              </span>
                              <span className="text-muted-foreground">
                                Completed {fmtDateTime(s.completed_at)}
                              </span>
                              <Link
                                href={`/study/mock-exams/session/${s.id}`}
                                className="text-primary underline"
                              >
                                Review
                              </Link>
                            </>
                          ) : (
                            <>
                              <Badge tone="blue">In progress</Badge>
                              <span className="text-muted-foreground">
                                Started {fmtDateTime(s.started_at)}
                              </span>
                              <Link
                                href={`/study/mock-exams/session/${s.id}`}
                                className="text-primary underline"
                              >
                                Resume
                              </Link>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
