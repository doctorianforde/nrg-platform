import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { filtersToQuery, parseFilters, STATUS_BADGE, STATUS_LABEL, STUDENT_SOURCE, type ReviewStatus } from "@/lib/review/filters";
import { findNextId, findPosition } from "@/lib/review/queue";
import { ReviewForm } from "./ReviewForm";

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

  const { data: q } = await supabase
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

  const [nextId, pos] = await Promise.all([findNextId(supabase, f, q.id), findPosition(supabase, f, q.id)]);

  const status = q.review_status as ReviewStatus;
  const inSet = f.status === "all" || f.status === status;
  const saved = searchParams.saved === "1";

  return (
    <DashboardShell profile={profile} email={user.email} title="Review question">
      <div className="text-gray-900">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/teacher/review${qs}`} className="text-[hsl(270,60%,35%)] underline">← Back to list</Link>
          <span className="text-gray-600">
            {inSet ? `${pos.position} of ${pos.total} in this filter` : `${pos.total} in this filter`}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
          {q.reviewed_at && (
            <span className="text-xs text-gray-600">
              {q.reviewed_by === user.id ? "by you · " : ""}{new Date(q.reviewed_at).toLocaleString()}
            </span>
          )}
          <span className="ml-auto font-mono text-xs text-gray-400">{q.source_id?.split(":").pop()}</span>
          {nextId && nextId !== q.id && (
            <Link href={`/teacher/review/${nextId}${qs}`} className="rounded border border-gray-300 bg-white px-3 py-1">Skip →</Link>
          )}
        </div>
        {saved && <p className="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-800">Edits saved.</p>}
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
