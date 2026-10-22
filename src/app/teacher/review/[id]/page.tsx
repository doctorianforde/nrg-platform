import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { filtersToQuery, parseFilters, STATUS_LABEL, STUDENT_SOURCE, type ReviewStatus } from "@/lib/review/filters";

const STATUS_TONE: Record<ReviewStatus, "gray" | "green" | "amber" | "red"> = {
  pending: "gray",
  approved: "green",
  needs_changes: "amber",
  rejected: "red",
};
import { findNextId, findPosition } from "@/lib/review/queue";
import { ReviewForm } from "./ReviewForm";
import { EvaluationCard } from "@/components/grading/EvaluationCard";
import { evaluationOf } from "@/lib/xp/queries";

export const dynamic = "force-dynamic";

export default async function ReviewQuestionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, profile } = await requireRole("teacher", `/teacher/review/${params.id}`);
  const supabase = createClient();
  const f = parseFilters(searchParams);
  const qs = filtersToQuery(f);

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  // Keys and explanations are not readable with a user token (migration 20261012170000); staff read them here, after
  // requireRole("teacher") above, through the server-only service client.
  const { data: q } = await adminClient
    .from("questions")
    .select(
      `id, body, explanation, cognitive_level, difficulty, question_type, review_status, review_notes, reviewed_at, reviewed_by, is_active, is_ai_generated, source, source_id, updated_at, domains(code, name), topics(name, topic_clusters(name)), question_options(id, body, is_correct, rationale, display_order)`
    )
    .eq("id", params.id)
    .order("display_order", { referencedTable: "question_options" })
    .maybeSingle();
  // The queue covers the AI bank and student submissions; a client import is
  // neither and is not reviewed here.
  if (!q || !(q.is_ai_generated || q.source === STUDENT_SOURCE)) notFound();

  const [nextId, pos, { data: evRow }] = await Promise.all([
    findNextId(supabase, f, q.id),
    findPosition(supabase, f, q.id),
    adminClient.from("question_evaluations").select("status, pathway, overall, passed, result, assignment").eq("question_id", q.id).maybeSingle(),
  ]);
  const evaluation = evaluationOf(evRow);
  const asg = (evRow?.assignment ?? null) as { topic?: string; domainCode?: string; taxonomy?: string; stemLength?: string } | null;

  const status = q.review_status as ReviewStatus;
  const inSet = f.status === "all" || f.status === status;
  const saved = searchParams.saved === "1";

  return (
    <DashboardShell profile={profile} email={user.email} title="Review question">
      <div className="text-foreground">
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm shadow-sm">
          <Link href={`/teacher/review${qs}`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50">← Back to list</Link>
          <span className="tabular-nums text-muted-foreground">
            {inSet ? `${pos.position} of ${pos.total} in this filter` : `${pos.total} in this filter`}
          </span>
          <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>
          {q.reviewed_at && (
            <span className="text-xs text-muted-foreground">
              {q.reviewed_by === user.id ? "by you · " : ""}{new Date(q.reviewed_at).toLocaleString()}
            </span>
          )}
          <span className="ml-auto font-mono text-xs text-muted-foreground/60">{q.source_id?.split(":").pop()}</span>
          {nextId && nextId !== q.id && (
            <Link href={`/teacher/review/${nextId}${qs}`} className="rounded-lg border border-border bg-card px-4 py-1.5 text-sm font-medium text-card-foreground transition-colors hover:border-brand-300 hover:bg-muted">Skip →</Link>
          )}
        </div>
        {saved && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">Edits saved.</p>}
        {evaluation ? (
          <div className="mb-4 rounded-xl border border-brand-200 bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">AI grade (advice — you decide)</p>
            {asg ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Assignment: {asg.topic} · {asg.domainCode} · {asg.taxonomy} · {asg.stemLength?.replace("_", "-")} stem
              </p>
            ) : null}
            <EvaluationCard ev={evaluation} staff open />
          </div>
        ) : null}
        <ReviewForm
          key={q.updated_at}
          question={{
            id: q.id,
            updated_at: q.updated_at,
            body: q.body,
            explanation: q.explanation ?? "",
            cognitive_level: q.cognitive_level ?? "application",
            difficulty: q.difficulty ?? "medium",
            question_type: q.question_type,
            review_status: status,
            review_notes: q.review_notes ?? "",
            is_active: q.is_active,
            domain: q.domains ? `${q.domains.code} — ${q.domains.name}` : "—",
            topic: q.topics?.name ?? "—",
            cluster: q.topics?.topic_clusters?.name ?? "—",
            options: q.question_options.map((o) => ({ id: o.id, body: o.body, is_correct: o.is_correct, rationale: o.rationale ?? "" })),
          }}
          qs={qs}
        />
      </div>
    </DashboardShell>
  );
}
