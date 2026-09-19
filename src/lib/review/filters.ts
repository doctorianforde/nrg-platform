export const REVIEW_STATUSES = ["pending", "approved", "needs_changes", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  needs_changes: "Needs changes",
  rejected: "Rejected",
};

export const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  approved: "bg-green-100 text-green-800",
  needs_changes: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
};

export const COGNITIVE_LEVELS = ["knowledge", "comprehension", "application", "analysis"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const PAGE_SIZE = 25;

export type Filters = {
  status: ReviewStatus | "all";
  domain: number | null;
  cluster: number | null;
  cognitive: string | null;
  difficulty: string | null;
  q: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const intOrNull = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[]) =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : null;

export function parseFilters(sp: SearchParams): Filters {
  const status = first(sp.status);
  return {
    status: status === "all" ? "all" : oneOf(status, REVIEW_STATUSES) ?? "pending",
    domain: intOrNull(first(sp.domain)),
    cluster: intOrNull(first(sp.cluster)),
    cognitive: oneOf(first(sp.cognitive), COGNITIVE_LEVELS),
    difficulty: oneOf(first(sp.difficulty), DIFFICULTIES),
    q: (first(sp.q) ?? "").trim().slice(0, 200),
    page: intOrNull(first(sp.page)) ?? 1,
  };
}

/** Serialises filters back into a query string, omitting defaults. */
export function filtersToQuery(f: Filters, override: Partial<Filters> = {}): string {
  const m = { ...f, ...override };
  const p = new URLSearchParams();
  if (m.status !== "pending") p.set("status", m.status);
  if (m.domain) p.set("domain", String(m.domain));
  if (m.cluster) p.set("cluster", String(m.cluster));
  if (m.cognitive) p.set("cognitive", m.cognitive);
  if (m.difficulty) p.set("difficulty", m.difficulty);
  if (m.q) p.set("q", m.q);
  if (m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// The Supabase builder's generics don't survive being passed through a helper, so it's typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters<T>(query: T, f: Filters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;
  q = q.eq("is_ai_generated", true);
  if (f.status !== "all") q = q.eq("review_status", f.status);
  if (f.domain) q = q.eq("domain_id", f.domain);
  if (f.cluster) q = q.eq("topics.cluster_id", f.cluster);
  if (f.cognitive) q = q.eq("cognitive_level", f.cognitive);
  if (f.difficulty) q = q.eq("difficulty", f.difficulty);
  if (f.q) q = q.ilike("body", `%${f.q.replace(/[\\%_]/g, "\\$&")}%`);
  return q as T;
}
