import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ThreadList } from "@/components/messages/ThreadList";
import { loadThreads } from "@/lib/messages/queries";

export const dynamic = "force-dynamic";

export default async function TeacherMessagesPage() {
  const { user, profile } = await requireRole("teacher", "/teacher/messages");
  const threads = await loadThreads(createClient(), user.id, true);

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
          <StatCard label="Conversations" value={threads.length} />
        </div>

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
            Students start these conversations — you can reply to any of them, but you can&apos;t
            open one, because the student roster isn&apos;t visible to teachers.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
