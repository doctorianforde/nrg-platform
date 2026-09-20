import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { capitalize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import {
  applyFilters,
  COGNITIVE_LEVELS,
  DIFFICULTIES,
  filtersToQuery,
  PAGE_SIZE,
  parseFilters,
  REVIEW_STATUSES,
  STATUS_BADGE,
  STATUS_LABEL,
  type ReviewStatus,
} from "@/lib/review/filters";

export const dynamic = "force-dynamic";

const selectCls = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900";

export default async function ReviewListPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { user, profile } = await requireRole("teacher", "/teacher/review");
  const supabase = createClient();
  const f = parseFilters(searchParams);

  const listQuery = f.cluster
    ? supabase.from("questions").select("id, body, cognitive_level, difficulty, review_status, source_id, domains(code, name), topics!inner(name, cluster_id)", { count: "exact" })
    : supabase.from("questions").select("id, body, cognitive_level, difficulty, review_status, source_id, domains(code, name), topics(name, cluster_id)", { count: "exact" });

  const [list, domains, clusters, ...counts] = await Promise.all([
    applyFilters(listQuery, f)
      .order("id")
      .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1),
    supabase.from("domains").select("id, code, name").order("display_order"),
    supabase.from("topic_clusters").select("id, name").order("display_order"),
    ...REVIEW_STATUSES.map((s) =>
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("is_ai_generated", true).eq("review_status", s)
    ),
  ]);

  const byStatus = Object.fromEntries(REVIEW_STATUSES.map((s, i) => [s, counts[i].count ?? 0])) as Record<ReviewStatus, number>;
  const total = REVIEW_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  const reviewed = total - byStatus.pending;
  const matches = list.count ?? 0;
  const pages = Math.max(1, Math.ceil(matches / PAGE_SIZE));
  const rows = list.data ?? [];

  return (
    <DashboardShell profile={profile} email={user.email} title="Review AI-generated questions">
      <div className="text-gray-900 space-y-5">
        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <strong>{reviewed.toLocaleString()}</strong> of {total.toLocaleString()} reviewed
            </p>
            {byStatus.pending > 0 && (
              <Link
                href={`/teacher/review${filtersToQuery({ ...f, status: "pending", page: 1 })}`}
                className="text-sm text-[hsl(270,60%,35%)] underline"
              >
                Show pending only
              </Link>
            )}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-100 flex">
            <div className="bg-green-500" style={{ width: `${total ? (byStatus.approved / total) * 100 : 0}%` }} />
            <div className="bg-amber-400" style={{ width: `${total ? (byStatus.needs_changes / total) * 100 : 0}%` }} />
            <div className="bg-red-400" style={{ width: `${total ? (byStatus.rejected / total) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {REVIEW_STATUSES.map((s) => (
              <Link
                key={s}
                href={`/teacher/review${filtersToQuery({ ...f, status: s, page: 1 })}`}
                className={`rounded px-2 py-1 ${STATUS_BADGE[s]} ${f.status === s ? "ring-2 ring-[hsl(270,60%,35%)]" : ""}`}
              >
                {STATUS_LABEL[s]}: {byStatus[s].toLocaleString()}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-600">
            Approving a question sets it active for students. Pending, needs-changes and rejected questions stay inactive.
          </p>
        </section>

        <form method="get" className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-gray-600">Status</span>
            <select name="status" defaultValue={f.status} className={selectCls}>
              <option value="all">All</option>
              {REVIEW_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-600">Domain</span>
            <select name="domain" defaultValue={f.domain ?? ""} className={selectCls}>
              <option value="">All domains</option>
              {(domains.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-600">Clinical area</span>
            <select name="cluster" defaultValue={f.cluster ?? ""} className={selectCls}>
              <option value="">All areas</option>
              {(clusters.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-600">Cognitive level</span>
            <select name="cognitive" defaultValue={f.cognitive ?? ""} className={selectCls}>
              <option value="">All</option>
              {COGNITIVE_LEVELS.map((c) => (
                <option key={c} value={c}>{capitalize(c)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-gray-600">Difficulty</span>
            <select name="difficulty" defaultValue={f.difficulty ?? ""} className={selectCls}>
              <option value="">All</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{capitalize(d)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 grow min-w-[10rem]">
            <span className="text-xs text-gray-600">Search question text</span>
            <input name="q" defaultValue={f.q} placeholder="e.g. digoxin" className={`${selectCls} w-full`} />
          </label>
          <button className="rounded bg-[hsl(270,60%,35%)] px-3 py-1.5 text-white">Apply</button>
          <Link href="/teacher/review" className="py-1.5 text-gray-600 underline">Reset</Link>
        </form>

        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white">
          <div className="flex items-center justify-between border-b border-[hsl(270,15%,92%)] px-4 py-3 text-sm">
            <span>
              {matches.toLocaleString()} matching question{matches === 1 ? "" : "s"}
            </span>
            {rows.length > 0 && (
              <Link href={`/teacher/review/${rows[0].id}${filtersToQuery(f)}`} className="rounded bg-[hsl(270,60%,35%)] px-3 py-1 text-white">
                Start reviewing
              </Link>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-600">
              {f.status === "pending" && byStatus.pending === 0 ? "Nothing left to review." : "No questions match these filters."}
            </p>
          ) : (
            <ul className="divide-y divide-[hsl(270,15%,92%)]">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/teacher/review/${r.id}${filtersToQuery(f)}`} className="block px-4 py-3 hover:bg-[hsl(270,25%,98%)]">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className={`rounded px-1.5 py-0.5 ${STATUS_BADGE[r.review_status as ReviewStatus] ?? STATUS_BADGE.pending}`}>
                        {STATUS_LABEL[r.review_status as ReviewStatus] ?? r.review_status}
                      </span>
                      <span>{r.domains?.code}</span>
                      <span>·</span>
                      <span>{r.topics?.name}</span>
                      <span>·</span>
                      <span>{capitalize(r.cognitive_level)}</span>
                      <span>·</span>
                      <span>{capitalize(r.difficulty)}</span>
                      <span className="ml-auto font-mono text-gray-400">{r.source_id?.split(":").pop()}</span>
                    </div>
                    <p className="mt-1 text-sm line-clamp-2">{r.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-[hsl(270,15%,92%)] px-4 py-3 text-sm">
              {f.page > 1 ? (
                <Link href={`/teacher/review${filtersToQuery(f, { page: f.page - 1 })}`} className="underline">← Previous</Link>
              ) : <span />}
              <span className="text-gray-600">Page {f.page} of {pages}</span>
              {f.page < pages ? (
                <Link href={`/teacher/review${filtersToQuery(f, { page: f.page + 1 })}`} className="underline">Next →</Link>
              ) : <span />}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
