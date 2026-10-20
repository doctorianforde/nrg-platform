import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { capitalize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import {
  applyFilters,
  COGNITIVE_LEVELS,
  DIFFICULTIES,
  filtersToQuery,
  PAGE_SIZE,
  parseFilters,
  REVIEW_STATUSES,
  SOURCES,
  SOURCE_LABEL,
  PROTOTYPE_SOURCE,
  STATUS_LABEL,
  STUDENT_SOURCE,
  type ReviewStatus,
} from "@/lib/review/filters";

export const dynamic = "force-dynamic";

const selectCls =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const STATUS_TONE: Record<ReviewStatus, "gray" | "green" | "amber" | "red"> = {
  pending: "gray",
  approved: "green",
  needs_changes: "amber",
  rejected: "red",
};

export default async function ReviewListPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { user, profile } = await requireRole("teacher", "/teacher/review");
  const supabase = createClient();
  const f = parseFilters(searchParams);

  const listQuery = f.cluster
    ? supabase.from("questions").select("id, body, cognitive_level, difficulty, review_status, source_id, source, domains(code, name), topics!inner(name, cluster_id)", { count: "exact" })
    : supabase.from("questions").select("id, body, cognitive_level, difficulty, review_status, source_id, source, domains(code, name), topics(name, cluster_id)", { count: "exact" });

  const [list, domains, clusters, ...counts] = await Promise.all([
    applyFilters(listQuery, f)
      .order("id")
      .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1),
    supabase.from("domains").select("id, code, name").order("display_order"),
    supabase.from("topic_clusters").select("id, name").order("display_order"),
    ...REVIEW_STATUSES.map((s) =>
      applyFilters(
        supabase.from("questions").select("id", { count: "exact", head: true }),
        { ...f, status: s }
      ).eq("review_status", s)
    ),
  ]);

  const byStatus = Object.fromEntries(REVIEW_STATUSES.map((s, i) => [s, counts[i].count ?? 0])) as Record<ReviewStatus, number>;
  const total = REVIEW_STATUSES.reduce((n, s) => n + byStatus[s], 0);
  const reviewed = total - byStatus.pending;
  const matches = list.count ?? 0;
  const pages = Math.max(1, Math.ceil(matches / PAGE_SIZE));
  const rows = list.data ?? [];

  return (
    <DashboardShell profile={profile} email={user.email} title="Review questions">
      <div className="space-y-5 text-foreground">
        {f.run ? (
          <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
            Showing only questions from generator run <code className="text-xs">{f.run}</code>.{" "}
            <Link href={`/teacher/review${filtersToQuery({ ...f, run: null, page: 1 })}`} className="font-medium underline">
              Show the whole queue
            </Link>
          </p>
        ) : null}
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm motion-safe:animate-rise-in">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="tabular-nums text-sm text-card-foreground">
              <strong>{reviewed.toLocaleString()}</strong> of {total.toLocaleString()} reviewed
            </p>
            {byStatus.pending > 0 && (
              <Link
                href={`/teacher/review${filtersToQuery({ ...f, status: "pending", page: 1 })}`}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
              >
                Show pending only
              </Link>
            )}
          </div>
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-gradient-to-r from-green-500 to-green-400" style={{ width: `${total ? (byStatus.approved / total) * 100 : 0}%` }} />
            <div className="bg-gradient-to-r from-amber-400 to-amber-300" style={{ width: `${total ? (byStatus.needs_changes / total) * 100 : 0}%` }} />
            <div className="bg-gradient-to-r from-red-400 to-red-300" style={{ width: `${total ? (byStatus.rejected / total) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {REVIEW_STATUSES.map((s) => (
              <Link
                key={s}
                href={`/teacher/review${filtersToQuery({ ...f, status: s, page: 1 })}`}
                className={`rounded-full transition-shadow ${f.status === s ? "ring-2 ring-ring/60 ring-offset-1" : "hover:ring-2 hover:ring-ring/30"}`}
              >
                <Badge tone={STATUS_TONE[s]} dot className="tabular-nums">
                  {STATUS_LABEL[s]}: {byStatus[s].toLocaleString()}
                </Badge>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Approving a question sets it active for students. Pending, needs-changes and rejected questions stay
            inactive. Approving a student&apos;s submission also awards them XP.
          </p>
        </section>

        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border/80 bg-card p-4 text-sm shadow-sm">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <select name="status" defaultValue={f.status} className={selectCls}>
              <option value="all">All</option>
              {REVIEW_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Source</span>
            <select name="source" defaultValue={f.source} className={selectCls}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Domain</span>
            <select name="domain" defaultValue={f.domain ?? ""} className={selectCls}>
              <option value="">All domains</option>
              {(domains.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Clinical area</span>
            <select name="cluster" defaultValue={f.cluster ?? ""} className={selectCls}>
              <option value="">All areas</option>
              {(clusters.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Cognitive level</span>
            <select name="cognitive" defaultValue={f.cognitive ?? ""} className={selectCls}>
              <option value="">All</option>
              {COGNITIVE_LEVELS.map((c) => (
                <option key={c} value={c}>{capitalize(c)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Difficulty</span>
            <select name="difficulty" defaultValue={f.difficulty ?? ""} className={selectCls}>
              <option value="">All</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{capitalize(d)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 grow min-w-[10rem]">
            <span className="text-xs font-medium text-muted-foreground">Search question text</span>
            <input name="q" defaultValue={f.q} placeholder="e.g. digoxin" className={`${selectCls} w-full`} />
          </label>
          <button className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md">Apply</button>
          <Link href="/teacher/review" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground">Reset</Link>
        </form>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3 text-sm">
            <span className="tabular-nums text-card-foreground">
              {matches.toLocaleString()} matching question{matches === 1 ? "" : "s"}
            </span>
            {rows.length > 0 && (
              <Link href={`/teacher/review/${rows[0].id}${filtersToQuery(f)}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md">
                Start reviewing
              </Link>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {f.status === "pending" && byStatus.pending === 0 ? "Nothing left to review." : "No questions match these filters."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/teacher/review/${r.id}${filtersToQuery(f)}`} className="block px-4 py-3.5 transition-colors hover:bg-muted/60">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge tone={STATUS_TONE[r.review_status as ReviewStatus] ?? "gray"} dot>
                        {STATUS_LABEL[r.review_status as ReviewStatus] ?? r.review_status}
                      </Badge>
                      <Badge
                        tone={
                          r.source === STUDENT_SOURCE
                            ? "green"
                            : r.source === PROTOTYPE_SOURCE
                              ? "purple"
                              : "blue"
                        }
                      >
                        {r.source === STUDENT_SOURCE
                          ? "Student"
                          : r.source === PROTOTYPE_SOURCE
                            ? "Prototype"
                            : "AI"}
                      </Badge>
                      <span>{r.domains?.code}</span>
                      <span>·</span>
                      <span>{r.topics?.name}</span>
                      <span>·</span>
                      <span>{capitalize(r.cognitive_level)}</span>
                      <span>·</span>
                      <span>{capitalize(r.difficulty)}</span>
                      <span className="ml-auto font-mono text-muted-foreground/60">{r.source_id?.split(":").pop()}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-card-foreground">{r.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3 text-sm">
              {f.page > 1 ? (
                <Link href={`/teacher/review${filtersToQuery(f, { page: f.page - 1 })}`} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:border-brand-300 hover:bg-muted">← Previous</Link>
              ) : <span />}
              <span className="tabular-nums text-muted-foreground">Page {f.page} of {pages}</span>
              {f.page < pages ? (
                <Link href={`/teacher/review${filtersToQuery(f, { page: f.page + 1 })}`} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:border-brand-300 hover:bg-muted">Next →</Link>
              ) : <span />}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
