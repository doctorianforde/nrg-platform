import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { StageBlock } from "@/components/case/StageBlock";
import { CaseQuestionReview } from "@/components/case/CaseReview";
import { SimpleMarkdown } from "@/components/case/SimpleMarkdown";
import { CJ_LABEL, getCaseHeader, getCaseQuestions, getStages } from "@/lib/case";
import { setCaseStatus, validateCase } from "../actions";

export const dynamic = "force-dynamic";

/** Answer/instructor view (V3 s.1 output modes): the whole case with keys, rationales, classification and metadata. */
export default async function TeacherCasePage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const { user, profile } = await requireRole("teacher", `/teacher/case-studies/${params.id}`);
  const header = await getCaseHeader(params.id);
  if (!header) notFound();
  const [stages, questions] = await Promise.all([getStages(header.id), getCaseQuestions(header.id, { withAnswers: true })]);
  const btn =
    "rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground transition-colors hover:border-brand-300 hover:bg-muted";
  const statusForm = (to: string, label: string, primary = false) => (
    <form action={setCaseStatus}>
      <input type="hidden" name="id" value={header.id} />
      <input type="hidden" name="to" value={to} />
      <button className={primary ? "rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md" : btn}>{label}</button>
    </form>
  );

  return (
    <DashboardShell profile={profile} email={user.email} title={header.title} eyebrow={`Instructor view · ${header.case_code ?? ""}`} subtitle={header.objective ?? ""}>
      <Link href="/teacher/case-studies" className="mb-4 inline-block rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50">← All cases</Link>
      {searchParams.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{searchParams.error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Case details</CardTitle>
          <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm text-card-foreground">
            <dt className="text-muted-foreground">Condition</dt><dd>{header.primary_condition}</dd>
            <dt className="text-muted-foreground">Patient</dt><dd>{header.population}</dd>
            <dt className="text-muted-foreground">Setting</dt><dd>{header.setting}</dd>
            <dt className="text-muted-foreground">Endpoint</dt><dd>{header.endpoint}</dd>
            <dt className="text-muted-foreground">Domain</dt><dd>{header.domain?.name ?? "—"}</dd>
            <dt className="text-muted-foreground">Difficulty</dt><dd className="capitalize">{header.difficulty}</dd>
            <dt className="text-muted-foreground">Source</dt><dd>{header.source}</dd>
          </dl>
          <ol className="mt-3 space-y-1 text-xs text-muted-foreground">
            {questions.map((q) => <li key={q.id}>Q{q.position} · {CJ_LABEL[q.cj_step]} · {q.meta.domain}/{q.meta.taxonomy} · {q.meta.topic}</li>)}
          </ol>
        </Card>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Review and publishing</CardTitle>
            <Badge tone={header.status === "approved" ? "green" : "amber"} dot>{header.status.replace("_", " ")}</Badge>
            {header.is_active ? <Badge tone="green" dot>Live to students</Badge> : <Badge tone="gray" dot>Not visible to students</Badge>}
          </div>
          <div className="mt-3 text-sm">
            <span className="font-medium text-card-foreground">Clinical validation: </span>
            <Badge tone={header.validation_status === "validated" ? "green" : "amber"} dot>{header.validation_status}</Badge>
            {header.validation_note ? <p className="mt-1 text-muted-foreground">{header.validation_note}{header.validated_at ? ` (${new Date(header.validated_at).toLocaleDateString()})` : ""}</p> : null}
          </div>
          {header.validation_status !== "validated" ? (
            <form action={validateCase} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={header.id} />
              <textarea name="note" rows={2} placeholder="e.g. Doses, thresholds and standing-order scope checked against the T&T formulary by J. Nicome" className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30" />
              <button className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100">Record clinical validation</button>
            </form>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/study/case-studies/${header.id}`} className={btn}>Preview as a student</Link>
            {header.is_active ? statusForm("unpublish", "Unpublish") : statusForm("publish", "Publish to students", true)}
            {header.status !== "in_review" ? statusForm("in_review", "Back to review") : null}
            {header.status !== "archived" ? statusForm("archived", "Archive") : null}
          </div>
        </Card>
      </div>

      {header.quality_report ? (
        <Card className="mt-4">
          <CardTitle>Quality report</CardTitle>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{header.quality_report}</p>
        </Card>
      ) : null}

      <h2 className="mb-3 mt-8 font-heading text-lg font-semibold text-foreground">The case, stage by stage</h2>
      <div className="space-y-4">
        {stages.map((s) => (
          <div key={s.id} className="space-y-3">
            <StageBlock stage={s} isOpening={s.stage_order === 0} />
            {questions.filter((q) => q.stageOrder === s.stage_order).map((q) => (
              <div key={q.id} className="ml-0 space-y-1 sm:ml-6">
                <CaseQuestionReview q={q} />
                {q.meta.self_test ? <p className="px-1 text-xs text-muted-foreground">Self-test: {q.meta.self_test}</p> : null}
              </div>
            ))}
          </div>
        ))}
      </div>

      {header.pathophysiology ? (
        <Card className="mt-6">
          <CardTitle>Pathophysiology teaching section</CardTitle>
          <div className="mt-3"><SimpleMarkdown text={header.pathophysiology} /></div>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
