import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { STATUS_BADGE, STATUS_LABEL, type ReviewStatus } from "@/lib/review/filters";
import { loadMySubmissions } from "@/lib/xp/queries";
import { fmtDateTime } from "@/lib/mock-exam/utils";
import { SubmitQuestionForm } from "./SubmitQuestionForm";

export const dynamic = "force-dynamic";

/** Kept in step with xp_for_approved_question() in the migration. */
const XP_PER_APPROVED_QUESTION = 150;

export default async function SubmitQuestionPage() {
  const { user, profile } = await requireRole("student", "/study/submit");
  const supabase = createClient();

  const [{ data: domains }, submissions] = await Promise.all([
    supabase.from("domains").select("id, code, name").order("display_order"),
    loadMySubmissions(supabase, user.id),
  ]);

  const approved = submissions.filter((s) => s.reviewStatus === "approved").length;
  const pending = submissions.filter((s) => s.reviewStatus === "pending").length;

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Write a question"
      eyebrow="Contribute"
      subtitle="Write a question for the bank. A teacher reviews it, and an approved question is the biggest single XP award on the platform."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card className="rounded-xl border-brand-100">
          <CardTitle className="mb-4">New question</CardTitle>
          <SubmitQuestionForm
            domains={domains ?? []}
            xpPerQuestion={XP_PER_APPROVED_QUESTION}
          />
        </Card>

        <div className="space-y-5">
          <Card className="rounded-xl border-brand-100">
            <CardTitle className="mb-1">Your submissions</CardTitle>
            <p className="mb-3 text-xs text-muted-foreground">
              {submissions.length === 0
                ? "Nothing submitted yet."
                : `${approved} approved · ${pending} waiting`}
            </p>
            {submissions.length === 0 ? (
              <EmptyState
                title="No submissions yet"
                body="Write your first question on the left — it's the fastest way to climb the ranks."
              />
            ) : (
              <ul className="space-y-3">
                {submissions.map((s) => (
                  <li key={s.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={STATUS_BADGE[s.reviewStatus as ReviewStatus] ?? STATUS_BADGE.pending}
                      >
                        {STATUS_LABEL[s.reviewStatus as ReviewStatus] ?? s.reviewStatus}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {fmtDateTime(s.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-sm text-card-foreground">{s.body}</p>
                    {s.reviewNotes ? (
                      <p className="mt-1.5 rounded-lg bg-muted/60 px-2 py-1.5 text-xs text-card-foreground">
                        <strong>Feedback:</strong> {s.reviewNotes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="rounded-xl border-brand-100">
            <CardTitle className="mb-2">What gets approved</CardTitle>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>· One clear question, with a clinical scenario behind it.</li>
              <li>· Exactly one defensible correct answer.</li>
              <li>· Three wrong options that are plausible, not filler.</li>
              <li>· Reasoning that explains why the others fall short.</li>
            </ul>
            <Link
              href="/study/profile"
              className="mt-3 inline-block text-sm text-brand-700 underline"
            >
              See your rank and XP
            </Link>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
