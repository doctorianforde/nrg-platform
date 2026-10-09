import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { StageBlock } from "@/components/case/StageBlock";
import { CaseRunner } from "@/components/case/CaseRunner";
import { formatDuration } from "@/components/case/time";
import { rangesFor } from "@/lib/case/reference";
import { CaseQuestionReview } from "@/components/case/CaseReview";
import { SimpleMarkdown } from "@/components/case/SimpleMarkdown";
import { canTakeCases, CJ_LABEL, getCaseHeader, getCaseQuestions, getStages } from "@/lib/case";
import { answerCase, startCase } from "./actions";

export const dynamic = "force-dynamic";

export default async function CaseStudyPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const path = `/study/case-studies/${params.id}`;
  const { user, profile } = await requireRole("student", path);
  const isStaff = hasAtLeast(profile.role, "teacher");
  const header = await getCaseHeader(params.id);
  // Students only see published cases; staff can open any case to preview it as a student would.
  if (!header || (!header.is_active && !isStaff)) notFound();

  const shell = (subtitle: string, children: React.ReactNode) => (
    <DashboardShell profile={profile} email={user.email} title={header.title} eyebrow="Case study" subtitle={subtitle}>
      <Link href="/study/case-studies" className="mb-4 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
        ← All case studies
      </Link>
      {!header.is_active ? (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Staff preview: this case is {header.status.replace("_", " ")} and not visible to students.
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{searchParams.error}</p>
      ) : null}
      {children}
    </DashboardShell>
  );

  if (!canTakeCases(profile)) {
    return shell("Unfolding clinical cases with decision points at each stage.", (
      <Card>
        <CardTitle>Case studies are part of the Standard and Premium plans</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">Ask your administrator about upgrading your plan to work through this case.</p>
      </Card>
    ));
  }

  const supabase = createClient();
  const { data: attempts } = await supabase
    .from("case_attempts")
    .select("*")
    .eq("case_study_id", header.id)
    .eq("student_id", user.id)
    .order("started_at", { ascending: false });
  const open = attempts?.find((a) => !a.completed_at) ?? null;
  const lastDone = attempts?.find((a) => a.completed_at) ?? null;
  const stages = await getStages(header.id);
  const opening = stages.find((s) => s.stage_order === 0);

  // ── Not started ──
  if (!open && !lastDone) {
    const qCount = (await getCaseQuestions(header.id, { withAnswers: false })).length;
    return shell("Work through the case as it unfolds. Answers lock as you go; rationales appear when you finish.", (
      <div className="space-y-4">
        {opening ? <StageBlock stage={opening} isOpening /> : null}
        <Card>
          <CardTitle>Before you start</CardTitle>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{qCount} questions. The case unfolds as slides: step back through earlier slides at any time, but new information only unlocks after you lock in an answer.</li>
            <li>Your answer locks when you continue. You cannot go back and change it.</li>
            <li>A timer records your time for the whole case and for each question. A calculator and reference ranges for reported lab results are on screen.</li>
            <li>No feedback appears during the case. Answers, rationales and a teaching section follow at the end.</li>
          </ul>
          <form action={startCase} className="mt-4">
            <input type="hidden" name="caseId" value={header.id} />
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800">Start the case</button>
          </form>
        </Card>
      </div>
    ));
  }

  // ── In progress: a slide show of the stages revealed so far ──
  if (open) {
    const questions = await getCaseQuestions(header.id, { withAnswers: false });
    const current = questions.find((q) => q.position === open.next_position);
    if (!current) notFound();
    const revealed = stages.filter((s) => s.stage_order <= current.stageOrder);
    const { data: answered } = await supabase.from("case_attempt_responses").select("answered_at").eq("attempt_id", open.id);
    // The question clock starts when the previous answer was locked in (or when the case was started).
    const questionStartedAt = (answered ?? []).map((r) => r.answered_at).sort().pop() ?? open.started_at;
    // Open on the first stage this question revealed, so new information is seen before answering.
    const prev = questions.find((q) => q.position === current.position - 1);
    const firstNewOrder = prev ? prev.stageOrder + 1 : 0;
    const firstNewIdx = revealed.findIndex((s) => s.stage_order >= firstNewOrder);
    return shell(`Work through the case slide by slide. Your answers so far are locked.`, (
      <CaseRunner
        key={current.id}
        caseId={header.id}
        attemptId={open.id}
        action={answerCase}
        slides={revealed}
        firstNew={firstNewIdx === -1 ? revealed.length - 1 : firstNewIdx}
        question={{ id: current.id, position: current.position, body: current.body, options: current.options.map((o) => ({ id: o.id, body: o.body })) }}
        total={questions.length}
        isLast={current.position === questions[questions.length - 1].position}
        ranges={rangesFor(revealed)}
        startedAt={open.started_at}
        questionStartedAt={questionStartedAt}
        serverNow={new Date().toISOString()}
      />
    ));
  }

  // ── Completed: answers, rationales, clinical-judgment profile, teaching section ──
  const attempt = lastDone!;
  const questions = await getCaseQuestions(header.id, { withAnswers: true });
  const { data: responses } = await supabase
    .from("case_attempt_responses")
    .select("question_id, selected_option_id, is_correct, answered_at")
    .eq("attempt_id", attempt.id);
  const byQ = new Map((responses ?? []).map((r) => [r.question_id, r]));
  // Time per question: from the previous answer (or the start of the case) to this one.
  let prevAt = Date.parse(attempt.started_at);
  const steps = questions.map((q) => {
    const at = byQ.get(q.id)?.answered_at ? Date.parse(byQ.get(q.id)!.answered_at) : null;
    const ms = at !== null ? at - prevAt : null;
    if (at !== null) prevAt = at;
    return { step: CJ_LABEL[q.cj_step] ?? q.cj_step, position: q.position, ok: byQ.get(q.id)?.is_correct ?? false, ms };
  });
  const totalMs = attempt.completed_at ? Date.parse(attempt.completed_at) - Date.parse(attempt.started_at) : null;

  return shell(`You scored ${attempt.correct_count}/${attempt.total_questions} (${Math.round(Number(attempt.score_pct ?? 0))}%).`, (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Your clinical-judgment profile</CardTitle>
          {totalMs !== null ? <span className="text-sm text-muted-foreground">Total time <span className="font-mono font-semibold text-card-foreground">{formatDuration(totalMs)}</span></span> : null}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.position} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span>Q{s.position} · {s.step}</span>
              <span className="flex items-center gap-2">
                {s.ms !== null ? <span className="font-mono text-xs text-muted-foreground" title="Time on this question">{formatDuration(s.ms)}</span> : null}
                <Badge tone={s.ok ? "green" : "red"}>{s.ok ? "Correct" : "Review"}</Badge>
              </span>
            </li>
          ))}
        </ul>
        <form action={startCase} className="mt-4">
          <input type="hidden" name="caseId" value={header.id} />
          <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Try the case again</button>
        </form>
      </Card>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-heading font-semibold">The full case record</summary>
        <div className="mt-4 space-y-4">
          {stages.map((s) => <StageBlock key={s.id} stage={s} isOpening={s.stage_order === 0} />)}
        </div>
      </details>

      <div className="space-y-4">
        {questions.map((q) => (
          <CaseQuestionReview key={q.id} q={q} selectedId={byQ.get(q.id)?.selected_option_id ?? null} />
        ))}
      </div>

      {header.pathophysiology ? (
        <Card>
          <CardTitle>Teaching review</CardTitle>
          <div className="mt-3"><SimpleMarkdown text={header.pathophysiology} /></div>
        </Card>
      ) : null}
    </div>
  ));
}
