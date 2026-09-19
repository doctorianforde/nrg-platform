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

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

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
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Mock Exams"
      eyebrow="Exam format"
      subtitle="RENR-style mock exams in real exam conditions — no feedback while you answer, and explanations stay locked until your teacher releases them after class review."
    >
      {(!sets || sets.length === 0) ? (
        <EmptyState
          title="No mock exams available yet"
          body="Your teacher hasn't published any exam sets."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {sets.map((set) => {
            const past = sessionsBySet.get(set.id) ?? [];
            const released = set.rationale_released_at != null;
            const count = set.mock_exam_set_questions?.length ?? 0;
            return (
              <Card
                key={set.id}
                className="flex flex-col rounded-xl border-brand-100 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <PlayIcon className="h-4 w-4" />
                  </span>
                  {released ? (
                    <Badge tone="green">Rationales released</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      <LockIcon className="h-3 w-3" /> Rationales locked
                    </span>
                  )}
                </div>
                <CardTitle className="mt-3 leading-snug">{set.title}</CardTitle>
                {set.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{set.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {count} question{count === 1 ? "" : "s"}
                </p>
                <div className="mt-4">
                  <StartExamForm setId={set.id} />
                </div>
                {past.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Your attempts
                    </div>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {past.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {s.completed_at ? (
                            <>
                              <span className="font-semibold text-brand-700">{fmtPct(s.score_pct)}</span>
                              <span className="text-xs text-muted-foreground">
                                {fmtDateTime(s.completed_at)}
                              </span>
                              <Link
                                href={`/study/mock-exams/session/${s.id}`}
                                className="ml-auto text-xs font-medium text-brand-700 underline"
                              >
                                Review
                              </Link>
                            </>
                          ) : (
                            <>
                              <Badge tone="blue">In progress</Badge>
                              <Link
                                href={`/study/mock-exams/session/${s.id}`}
                                className="ml-auto text-xs font-medium text-brand-700 underline"
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
