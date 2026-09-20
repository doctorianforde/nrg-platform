import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ThreadList } from "@/components/messages/ThreadList";
import { loadStudentRoster, loadThreads } from "@/lib/messages/queries";
import { NewStaffThreadForm } from "@/components/messages/NewStaffThreadForm";

export const dynamic = "force-dynamic";

export default async function TeacherMessagesPage() {
  const { user, profile } = await requireRole("teacher", "/teacher/messages");
  const supabase = createClient();
  const [threads, students] = await Promise.all([
    loadThreads(supabase, user.id, true),
    loadStudentRoster(supabase),
  ]);

  const unread = threads.filter((t) => t.unread).length;
  const awaiting = threads.filter((t) => t.status === "open").length;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Student messages"
      eyebrow="Instructor Portal"
      subtitle="Questions students have sent you, newest first."
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Unread" value={unread} hint={unread > 0 ? "Students are waiting" : "All caught up"} />
          <StatCard label="Awaiting a reply" value={awaiting} />
          <StatCard label="Conversations" value={threads.length} hint={`${students.length} students registered`} />
        </div>

        <Card className="rounded-xl border-brand-100">
          <CardTitle className="mb-1">Write to a student</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Start a conversation without waiting for them to ask — it lands on their profile.
          </p>
          <NewStaffThreadForm students={students} />
        </Card>

        <Card className="rounded-xl border-brand-100">
          <CardTitle className="mb-2">Inbox</CardTitle>
          <ThreadList
            threads={threads}
            basePath="/teacher/messages"
            showWho
            emptyTitle="No messages yet"
            emptyBody="When a student sends a question from their profile, it lands here."
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Conversations started by either side appear here.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
