import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ThreadList } from "@/components/messages/ThreadList";
import { NewThreadForm } from "@/components/messages/NewThreadForm";
import { DisplayNameForm } from "./DisplayNameForm";
import { AvatarUpload } from "./AvatarUpload";
import { loadCitableAttempts, loadThreads } from "@/lib/messages/queries";
import { fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { hasAtLeast } from "@/lib/auth/roles";
import { loadEvents, loadStudentOptions, monthRange } from "@/lib/calendar/queries";
import { parseMonth, toDateKey } from "@/lib/calendar/types";
import { CalendarPanel } from "@/components/calendar/CalendarPanel";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await requireRole("student", "/study/profile");
  const supabase = createClient();

  const attach = typeof searchParams.attach === "string" ? searchParams.attach : undefined;
  const isStaff = hasAtLeast(profile.role, "teacher");
  const { year, month } = parseMonth(
    typeof searchParams.m === "string" ? searchParams.m : undefined
  );
  const { from, to } = monthRange(year, month);

  const [events, students, threads, attempts, { data: sessions }] = await Promise.all([
    loadEvents(supabase, user.id, isStaff, from, to),
    isStaff ? loadStudentOptions(supabase) : Promise.resolve([]),
    loadThreads(supabase, user.id, false),
    loadCitableAttempts(supabase, user.id),
    supabase
      .from("mock_exam_sessions")
      .select("score_pct, completed_at")
      .eq("student_id", user.id)
      .not("completed_at", "is", null),
  ]);

  const completed = sessions ?? [];
  const avgScore =
    completed.length > 0
      ? completed.reduce((n, s) => n + (s.score_pct ?? 0), 0) / completed.length
      : null;
  const best = completed.reduce<number | null>(
    (top, s) => (s.score_pct != null && (top === null || s.score_pct > top) ? s.score_pct : top),
    null
  );
  const unread = threads.filter((t) => t.unread).length;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Your profile"
      eyebrow="Student"
      subtitle="Your details, your progress, and a direct line to your teacher."
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Mock exams completed" value={completed.length} />
          <StatCard label="Average score" value={fmtPct(avgScore)} hint="Completed attempts only" />
          <StatCard label="Best score" value={fmtPct(best)} />
          <StatCard
            label="Unread replies"
            value={unread}
            hint={unread > 0 ? "Your teacher has replied" : "Nothing new"}
          />
        </div>

        <Card id="calendar" className="scroll-mt-20 rounded-xl border-brand-100">
          <CardTitle>Calendar</CardTitle>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {isStaff
              ? "Your own entries plus anything you publish. Pick who each event is for — everyone, all students, staff, or named students."
              : "Exam dates and anything your teachers have shared with you. Entries you add here are private to you."}
          </p>
          <CalendarPanel
            year={year}
            month={month}
            events={events}
            isStaff={isStaff}
            students={students}
            todayKey={toDateKey(new Date())}
          />
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-5">
            <Card className="rounded-xl border-brand-100">
              <CardTitle>Ask your teacher</CardTitle>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Send a question and your teacher will reply here. Attach a mock exam result if
                you want feedback on a specific attempt.
              </p>
              <NewThreadForm attempts={attempts} preselectedSessionId={attach} />
            </Card>

            <Card className="rounded-xl border-brand-100">
              <CardTitle className="mb-2">Your conversations</CardTitle>
              <ThreadList
                threads={threads}
                basePath="/study/profile/threads"
                showWho={false}
                emptyTitle="No conversations yet"
                emptyBody="Anything you send your teacher will appear here, along with their replies."
              />
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="rounded-xl border-brand-100">
              <CardTitle className="mb-3">Your details</CardTitle>
              <AvatarUpload
                userId={user.id}
                name={profile.full_name}
                currentUrl={profile.avatar_url}
              />
              <div className="mt-4 border-t border-border pt-3">
                <DisplayNameForm currentName={profile.full_name ?? ""} />
              </div>
              <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate text-card-foreground">{user.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="capitalize text-card-foreground">{profile.subscription_tier}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Joined</dt>
                  <dd className="text-card-foreground">{fmtDateTime(user.created_at)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Your name is what your teacher sees when you write to them. Email and plan are
                changed by an administrator.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
