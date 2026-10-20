import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { fmtPct } from "@/lib/mock-exam/utils";
import { CreateSetForm } from "./CreateSetForm";

export const dynamic = "force-dynamic";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ClipboardIcon = () => (
  <Icon>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </Icon>
);

const PlayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" />
  </Icon>
);

const CheckCircleIcon = () => (
  <Icon>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </Icon>
);

const TrendingUpIcon = () => (
  <Icon>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </Icon>
);

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

  const rows = (sets ?? []).map((set) => {
    const sessions = set.mock_exam_sessions ?? [];
    const completed = sessions.filter((s) => s.completed_at != null);
    const avg =
      completed.length > 0
        ? completed.reduce((n, s) => n + (s.score_pct ?? 0), 0) / completed.length
        : null;
    return {
      set,
      questionCount: set.mock_exam_set_questions?.length ?? 0,
      sessionCount: sessions.length,
      completedCount: completed.length,
      avg,
    };
  });

  const totalSessions = rows.reduce((n, r) => n + r.sessionCount, 0);
  const totalCompleted = rows.reduce((n, r) => n + r.completedCount, 0);
  const overallAvg =
    totalCompleted > 0
      ? rows.reduce((n, r) => n + (r.avg ?? 0) * r.completedCount, 0) / totalCompleted
      : null;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Mock Exams"
      eyebrow="Instructor Portal"
      subtitle="Build RENR mock exam sets from the active question bank. Rationales stay locked until you deliberately release them — never automatically."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Exam sets" value={rows.length} icon={<ClipboardIcon />} iconTone="purple" />
        <StatCard label="Sessions started" value={totalSessions} icon={<PlayIcon />} iconTone="blue" />
        <StatCard label="Completed attempts" value={totalCompleted} icon={<CheckCircleIcon />} iconTone="green" />
        <StatCard label="Average score" value={fmtPct(overallAvg)} hint="Completed attempts only" icon={<TrendingUpIcon />} iconTone="amber" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {hasAtLeast(profile.role, "admin") && !showAll ? (
            <Link
              href="/teacher/mock-exams?all=1"
              className="inline-block rounded-full border border-brand-300 bg-card px-4 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              View all teachers&apos; exam sets
            </Link>
          ) : null}
          {rows.length === 0 ? (
            <EmptyState
              title="No exam sets yet"
              body="Create your first mock exam set with the form on the right."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm motion-safe:animate-rise-in">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Exam set</th>
                    <th className="px-4 py-3 font-medium">Questions</th>
                    <th className="px-4 py-3 font-medium">Sessions</th>
                    <th className="px-4 py-3 font-medium">Avg score</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(({ set, questionCount, sessionCount, avg }) => (
                    <tr key={set.id} className="transition-colors odd:bg-muted/40 hover:bg-muted/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-card-foreground">{set.title}</p>
                        {set.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {set.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="tabular-nums px-4 py-3 text-muted-foreground">{questionCount}</td>
                      <td className="tabular-nums px-4 py-3 text-muted-foreground">{sessionCount}</td>
                      <td className="tabular-nums px-4 py-3 text-card-foreground">{fmtPct(avg)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {set.is_active ? (
                            <Badge tone="green" dot>Active</Badge>
                          ) : (
                            <Badge tone="gray" dot>Inactive</Badge>
                          )}
                          {set.rationale_released_at ? (
                            <Badge tone="green">Rationales released</Badge>
                          ) : (
                            <Badge tone="amber">Rationales locked</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/teacher/mock-exams/${set.id}`}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="motion-safe:animate-fade-in">
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
