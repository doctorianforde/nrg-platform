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
import { EvaluationCard } from "@/components/grading/EvaluationCard";
import { getOrCreateAssignment } from "@/lib/grading/assign";
import { qgenConfig } from "@/lib/grading/store";
import { STEM_LENGTH, TAXONOMY_LABEL } from "@/lib/grading/rubric";
import { listReviews } from "@/lib/topic-reviews/queries";

export const dynamic = "force-dynamic";

/** Kept in step with xp_for_approved_question() in the migration. */
const XP_PER_APPROVED_QUESTION = 150;

export default async function SubmitQuestionPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await requireRole("student", "/study/submit");
  const supabase = createClient();

  // Method 3 (after a topic review) and method 2 (after practice) arrive with ?review= / ?from=practice.
  const reviewSlug = typeof searchParams.review === "string" ? searchParams.review : null;
  const review = reviewSlug ? (await listReviews()).find((r) => r.slug === reviewSlug && r.status === "published") ?? null : null;
  const method = review ? "review" : searchParams.from === "practice" ? "practice" : "bank";

  const [submissions, assignment, cfg, { data: daily }] = await Promise.all([
    loadMySubmissions(supabase, user.id),
    getOrCreateAssignment(user.id, { method, review: review ? { slug: review.slug, title: review.title } : null }),
    qgenConfig(),
    supabase.rpc("qgen_daily_status"),
  ]);
  const due = (daily as { due?: boolean } | null)?.due === true;

  const approved = submissions.filter((s) => s.reviewStatus === "approved").length;
  const pending = submissions.filter((s) => s.reviewStatus === "pending").length;

  return (
    <DashboardShell protect={false}
      profile={profile}
      email={user.email}
      title="Write a question"
      eyebrow="Contribute"
      subtitle="Write a question to your assignment. The AI grader scores it and tells you how to make it better; a teacher approves it for the bank, and that pays the biggest single XP award on the platform."
    >
      {due ? (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Today&apos;s question is due.</strong> Write one to keep practice and mock exams open.
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Card className="rounded-xl border-brand-100">
          <CardTitle className="mb-4">New question</CardTitle>
          <SubmitQuestionForm
            assignment={{
              id: assignment.id,
              topic: assignment.topic,
              domainCode: assignment.domainCode,
              domainName: assignment.domainName,
              taxonomy: assignment.taxonomy,
              taxonomyLabel: TAXONOMY_LABEL[assignment.taxonomy],
              stemLength: assignment.stemLength,
              stemLabel: STEM_LENGTH[assignment.stemLength].label,
              stemRule: STEM_LENGTH[assignment.stemLength].rule,
            }}
            xpPerQuestion={XP_PER_APPROVED_QUESTION}
            gradingMode={cfg.gradingMode}
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
                  <li key={s.id} className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
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
                    {s.evaluation ? <EvaluationCard ev={s.evaluation} open={s === submissions[0]} /> : null}
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
            {cfg.leaderboard === "students" ? (
              <Link href="/study/leaderboard" className="mt-3 block text-sm font-medium text-brand-700 underline">
                Question writers&apos; leaderboard
              </Link>
            ) : null}
            <Link
              href="/study/profile"
              className="mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              See your rank and XP
            </Link>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
