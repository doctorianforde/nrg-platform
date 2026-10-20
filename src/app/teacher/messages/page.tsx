import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ThreadList } from "@/components/messages/ThreadList";
import { loadStudentRoster, loadThreads } from "@/lib/messages/queries";
import { NewStaffThreadForm } from "@/components/messages/NewStaffThreadForm";

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

const MailIcon = () => (
  <Icon>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </Icon>
);

const ReplyIcon = () => (
  <Icon>
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </Icon>
);

const ChatIcon = () => (
  <Icon>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);

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
          <StatCard label="Unread" value={unread} hint={unread > 0 ? "Students are waiting" : "All caught up"} icon={<MailIcon />} iconTone={unread > 0 ? "amber" : "green"} />
          <StatCard label="Awaiting a reply" value={awaiting} icon={<ReplyIcon />} iconTone="blue" />
          <StatCard label="Conversations" value={threads.length} hint={`${students.length} students registered`} icon={<ChatIcon />} iconTone="purple" />
        </div>

        <Card>
          <CardTitle className="mb-1">Write to a student</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Start a conversation without waiting for them to ask — it lands on their profile.
          </p>
          <NewStaffThreadForm students={students} />
        </Card>

        <Card>
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
