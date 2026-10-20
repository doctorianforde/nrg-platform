import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TopicRow } from "@/lib/generation/interpret";
import type { GenerationRequest } from "@/lib/generation/request";
import catalog from "../../../../content/case-studies/catalog.json";
import rules from "../../../../scripts/generation-rules.json";
import { GenerateForm } from "./GenerateForm";
import { cancelRequest } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  draft: { tone: "gray", label: "Draft" },
  awaiting_confirmation: { tone: "amber", label: "Needs your OK" },
  queued: { tone: "blue", label: "Queued" },
  running: { tone: "purple", label: "Writing" },
  done: { tone: "green", label: "Ready for review" },
  failed: { tone: "red", label: "Failed" },
  cancelled: { tone: "gray", label: "Cancelled" },
};

type Row = {
  id: string; kind: string; mode: string; status: string; created_at: string; requested_by: string;
  request: GenerationRequest; result: { run_id?: string; items?: number; failures?: number; case_codes?: string[] } | null; error: string | null;
  profiles: { full_name: string | null } | null;
};

export default async function GeneratePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { user, profile } = await requireRole("teacher", "/teacher/generate");
  const supabase = createClient();

  const topics: TopicRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("topics").select("id, name, topic_clusters(code)").eq("is_active", true).order("name").range(from, from + 999);
    const rows = (data ?? []) as unknown as { id: number; name: string; topic_clusters: { code: TopicRow["cluster"] } | null }[];
    rows.forEach((t) => topics.push({ id: t.id, name: t.name, cluster: t.topic_clusters?.code ?? null }));
    if (rows.length < 1000) break;
  }

  const { data: reqData, error: reqError } = await supabase
    .from("generation_requests")
    .select("id, kind, mode, status, created_at, requested_by, request, result, error, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  const requests = (reqData ?? []) as unknown as Row[];
  const flash = typeof searchParams.queued === "string" ? "Queued. It will be written in the next generation run, then it lands in review." : null;
  const error = typeof searchParams.error === "string" ? searchParams.error : null;

  return (
    <DashboardShell profile={profile} email={user.email} title="Generate content" eyebrow="Teaching"
      subtitle="Ask for new questions or case studies, in your own words or by choosing domain, topic, taxonomy and difficulty.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {flash ? <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">{flash}</p> : null}
          {error ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p> : null}
          <GenerateForm key={typeof searchParams.queued === "string" ? searchParams.queued : "new"} topics={topics} caseConditions={catalog.conditions.map((c) => c.condition)} dropDifficulty={rules.switches_pending_jade.drop_difficulty} />
        </div>

        <aside className="min-w-0 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">Requests</h2>
          {reqError ? (
            <Card><p className="text-sm text-red-700">Requests could not be loaded: {reqError.message}</p></Card>
          ) : requests.length === 0 ? (
            <EmptyState title="No requests yet" body="Requests you queue appear here with their progress." />
          ) : (
            requests.map((r) => {
              const s = STATUS[r.status] ?? STATUS.draft;
              const label = r.request.title ?? r.request.prompt ?? `${r.request.count} ${r.kind === "mcq" ? "questions" : "case studies"}`;
              const own = r.requested_by === user.id;
              return (
                <Card key={r.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone={s.tone} dot>{s.label}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </div>
                  <CardTitle className="line-clamp-2 text-sm">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {r.request.count} {r.kind === "mcq" ? "question" : "case"}{r.request.count === 1 ? "" : "s"} · {r.mode === "prompted" ? "described" : "chosen"}
                    {own ? "" : ` · ${r.profiles?.full_name ?? "another teacher"}`}
                  </p>
                  {r.status === "done" && r.kind === "mcq" && r.result?.run_id ? (
                    <Link href={`/teacher/review?run=${encodeURIComponent(r.result.run_id)}`} className="block text-sm font-medium text-primary hover:underline">
                      Review {r.result.items ?? ""} question{r.result.items === 1 ? "" : "s"} →
                    </Link>
                  ) : null}
                  {r.status === "done" && r.kind === "case_study" ? (
                    <Link href="/teacher/case-studies" className="block text-sm font-medium text-primary hover:underline">Open case studies →</Link>
                  ) : null}
                  {r.status === "failed" && r.error ? <p className="text-xs text-red-700">{r.error}</p> : null}
                  {own && ["draft", "awaiting_confirmation", "queued"].includes(r.status) ? (
                    <form action={cancelRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs font-medium text-muted-foreground underline hover:text-red-700">Cancel</button>
                    </form>
                  ) : null}
                </Card>
              );
            })
          )}
        </aside>
      </div>
    </DashboardShell>
  );
}
