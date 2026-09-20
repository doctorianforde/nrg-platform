import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Conversation } from "@/components/messages/Conversation";
import { loadThread } from "@/lib/messages/queries";
import { markThreadRead } from "@/lib/messages/actions";

export const dynamic = "force-dynamic";

export default async function TeacherThreadPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireRole("teacher", `/teacher/messages/${params.id}`);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const data = await loadThread(createClient(), params.id, user.id, true);
  if (!data) notFound();
  await markThreadRead(params.id);

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title={data.thread.counterpartName ?? "Student conversation"}
      eyebrow="Instructor Portal"
      subtitle="Your reply goes straight to the student's profile."
    >
      <div className="space-y-4">
        <Link href="/teacher/messages" className="inline-block text-sm text-brand-700 underline">
          ‹ Back to the inbox
        </Link>
        <Conversation
          thread={data.thread}
          messages={data.messages}
          attemptHref={
            // Staff can read any session, but the student-facing results route checks
            // ownership, so the cited attempt isn't linked from this side.
            undefined
          }
          placeholder="Write your feedback…"
        />
      </div>
    </DashboardShell>
  );
}
