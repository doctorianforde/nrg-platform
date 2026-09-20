import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { GroupStandings, type Standing } from "@/components/exam/GroupStandings";
import { LobbyView, type LobbyMember } from "./LobbyView";

export const dynamic = "force-dynamic";

type Member = {
  student_id: string;
  is_owner: boolean;
  invited: boolean;
  session_id: string | null;
};

export default async function GroupExamPage({ params }: { params: { groupId: string } }) {
  const { user, profile } = await requireRole(
    "student",
    `/study/mock-exams/group/${params.groupId}`
  );
  const supabase = createClient();

  // Settles any member whose deadline passed while their browser was closed, so
  // the standings below are not stuck behind someone who walked away.
  await supabase.rpc("complete_expired_exam_sessions");

  const { data: group } = await supabase
    .from("exam_groups")
    .select("id, set_id, created_by, name, join_code, max_members, status, expires_at")
    .eq("id", params.groupId)
    .maybeSingle();
  // RLS already hides other people's groups; a miss means "not yours".
  if (!group) redirect("/study/mock-exams");

  const [{ data: members }, { data: set }, { count: questionCount }] = await Promise.all([
    supabase
      .from("exam_group_members")
      .select("student_id, is_owner, invited, session_id")
      .eq("group_id", group.id)
      .order("joined_at"),
    supabase
      .from("mock_exam_sets")
      .select("title, duration_minutes")
      .eq("id", group.set_id)
      .maybeSingle(),
    supabase
      .from("mock_exam_set_questions")
      .select("question_id", { count: "exact", head: true })
      .eq("set_id", group.set_id),
  ]);

  const roster = (members ?? []) as Member[];
  const mine = roster.find((m) => m.student_id === user.id);
  if (!mine) redirect("/study/mock-exams");

  const ids = roster.map((m) => m.student_id);
  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const nameOf = (id: string) =>
    people?.find((p) => p.id === id)?.full_name?.trim() || "A classmate";

  // Running: this member belongs in their own attempt, not on the lobby screen.
  if (group.status === "running" && mine.session_id) {
    redirect(`/study/mock-exams/session/${mine.session_id}`);
  }

  if (group.status === "cancelled") {
    return (
      <DashboardShell profile={profile} email={user.email} title="Group exam" eyebrow="Exam format">
        <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This group was closed before it started.{" "}
            <Link href="/study/mock-exams" className="text-primary underline">
              Back to mock exams
            </Link>
            .
          </p>
        </div>
      </DashboardShell>
    );
  }

  if (group.status === "finished" || (group.status === "running" && !mine.session_id)) {
    const { data: sessions } = await supabase
      .from("mock_exam_sessions")
      .select("id, student_id, score_pct, correct_count, total_questions, completed_at")
      .eq("group_id", group.id);

    const standings: Standing[] = roster.map((m) => {
      const s = sessions?.find((x) => x.student_id === m.student_id);
      return {
        studentId: m.student_id,
        name: nameOf(m.student_id),
        scorePct: s?.score_pct ?? null,
        correct: s?.correct_count ?? null,
        total: s?.total_questions ?? null,
        completed: Boolean(s?.completed_at),
        isYou: m.student_id === user.id,
      };
    });

    return (
      <DashboardShell
        profile={profile}
        email={user.email}
        title={group.name || "Group exam"}
        eyebrow="Exam format"
        subtitle={`${set?.title ?? "Mock exam"} — everyone answered for themselves.`}
      >
        <div className="mx-auto w-full max-w-2xl space-y-5">
          <GroupStandings standings={standings} />
          {mine.session_id ? (
            <Link
              href={`/study/mock-exams/session/${mine.session_id}`}
              className="inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white"
            >
              See your own paper
            </Link>
          ) : null}
          <Link
            href="/study/mock-exams"
            className="ml-3 text-sm text-muted-foreground underline hover:text-brand-700"
          >
            Back to mock exams
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const lobby: LobbyMember[] = roster.map((m) => ({
    studentId: m.student_id,
    name: nameOf(m.student_id),
    isOwner: m.is_owner,
    invited: m.invited,
    isYou: m.student_id === user.id,
  }));

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title={group.name || "Group exam"}
      eyebrow="Exam format"
      subtitle="Up to 5 of you sit the same paper at the same time. You each answer for yourself."
    >
      <LobbyView
        groupId={group.id}
        setTitle={set?.title ?? "Mock exam"}
        groupName={group.name}
        joinCode={group.join_code}
        members={lobby}
        maxMembers={group.max_members}
        canStart={mine.is_owner || group.created_by === user.id}
        durationMinutes={set?.duration_minutes ?? null}
        questionCount={questionCount ?? 0}
      />
    </DashboardShell>
  );
}
