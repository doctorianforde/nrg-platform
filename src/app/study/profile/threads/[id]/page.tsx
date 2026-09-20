import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Conversation } from "@/components/messages/Conversation";
import { loadThread } from "@/lib/messages/queries";
import { markThreadRead } from "@/lib/messages/actions";

export const dynamic = "force-dynamic";

export default async function StudentThreadPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireRole("student", `/study/profile/threads/${params.id}`);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const data = await loadThread(createClient(), params.id, user.id, false);
  // RLS returns nothing for a thread that isn't theirs, so this covers both cases.
  if (!data) notFound();
  await markThreadRead(params.id);

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Conversation"
      eyebrow="Student"
      subtitle="Your teacher will reply here. You'll see a marker on your profile when they do."
    >
      <div className="space-y-4">
        <Link href="/study/profile" className="inline-block text-sm text-brand-700 underline">
          ‹ Back to your profile
        </Link>
        <Conversation
          thread={data.thread}
          messages={data.messages}
          attemptHref={
            data.thread.attempt
              ? `/study/mock-exams/session/${data.thread.attempt.sessionId}`
              : undefined
          }
          placeholder="Add to the conversation…"
        />
      </div>
    </DashboardShell>
  );
}
