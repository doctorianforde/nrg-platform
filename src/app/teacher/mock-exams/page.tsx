import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtPct } from "@/lib/mock-exam/utils";
import { CreateSetForm } from "./CreateSetForm";

export const dynamic = "force-dynamic";

export default async function TeacherMockExamsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await requireRole("teacher", "/teacher/mock-exams");
  const showAll = searchParams.all === "1" && hasAtLeast(profile.role, "admin");
  const supabase = createClient();

  let query = supabase
    .from("mock_exam_sets")
    .select(
      "id, title, description, is_active, rationale_released_at, created_at, mock_exam_set_questions(question_id), mock_exam_sessions(id, completed_at, score_pct)"
    )
    .order("created_at", { ascending: false });
  if (!showAll) query = query.eq("created_by", user.id);
  const { data: sets } = await query;

  return (
    <DashboardShell profile={profile} email={user.email} title="Mock exams">
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {hasAtLeast(profile.role, "admin") && !showAll ? (
            <p className="text-sm">
              <Link href="/teacher/mock-exams?all=1" className="text-primary underline">
                View all teachers&apos; exam sets
              </Link>
            </p>
          ) : null}
          {(!sets || sets.length === 0) ? (
            <EmptyState
              title="No exam sets yet"
              body="Create your first mock exam set with the form on the right."
            />
          ) : (
            sets.map((set) => {
              const questionCount = set.mock_exam_set_questions?.length ?? 0;
              const sessions = set.mock_exam_sessions ?? [];
              const completed = sessions.filter((s) => s.completed_at != null);
              const avg =
                completed.length > 0
                  ? completed.reduce((n, s) => n + (s.score_pct ?? 0), 0) / completed.length
                  : null;
              return (
                <Card key={set.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{set.title}</CardTitle>
                      {set.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{set.description}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {questionCount} question{questionCount === 1 ? "" : "s"} ·{" "}
                          {sessions.length} session{sessions.length === 1 ? "" : "s"} ·{" "}
                          {completed.length > 0
                            ? `avg score ${fmtPct(avg)}`
                            : "no completed attempts"}
                        </span>
                        {set.is_active ? (
                          <Badge tone="green">Active</Badge>
                        ) : (
                          <Badge tone="gray">Inactive</Badge>
                        )}
                        {set.rationale_released_at ? (
                          <Badge tone="green">Rationales released</Badge>
                        ) : (
                          <Badge tone="amber">Rationales locked</Badge>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/teacher/mock-exams/${set.id}`}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800"
                    >
                      Manage
                    </Link>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardTitle className="mb-3">New exam set</CardTitle>
            <CreateSetForm />
          </Card>
          <p className="text-xs text-muted-foreground">
            Rationale release is a deliberate action on each set&apos;s manage page — it never
            happens automatically.
          </p>
        </aside>
      </div>
    </DashboardShell>
  );
}
