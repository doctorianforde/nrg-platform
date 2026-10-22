import { createClient } from "@/lib/supabase/server";
import { linkScore, MIN_LINK_SCORE, type ReviewLink } from "./catalog";
import type { ReviewQuestion, ReviewSlide } from "./types";

export type ReviewSummary = ReviewLink & {
  id: string;
  system: string;
  status: "draft" | "published";
  related: string[];
  sortOrder: number;
  /** The caller opened it today (free students: that's their review for the day). */
  openedToday: boolean;
  /** The caller has read it to the end (and been paid for it). */
  read: boolean;
};

export type ReviewFull = ReviewSummary & {
  slides: ReviewSlide[];
  question: ReviewQuestion | null;
  publishedAt: string | null;
};

const SUMMARY = "id, slug, title, system, status, keywords, exclude, related, sort_order";

type Row = {
  id: string; slug: string; title: string; system: string; status: string;
  keywords: string[]; exclude: string[] | null; related: string[]; sort_order: number;
  opened_today?: boolean; read?: boolean;
};
const toSummary = (r: Row): ReviewSummary => ({
  id: r.id, slug: r.slug, title: r.title, system: r.system, status: r.status === "published" ? "published" : "draft",
  keywords: r.keywords ?? [], exclude: r.exclude ?? [], related: r.related ?? [], sortOrder: r.sort_order,
  openedToday: r.opened_today === true, read: r.read === true,
});

/**
 * Every review the caller may list: published ones, plus drafts for teaching staff. Titles only, so a free student whose
 * review time is used up still sees the list (the content itself is locked by RLS). Falls back to the table on a database
 * without 20261022160000, and is empty without topic_reviews at all.
 */
export async function listReviews(): Promise<ReviewSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("topic_review_list");
  if (!error && data) return (data as Row[]).map(toSummary);
  const { data: rows, error: e2 } = await supabase.from("topic_reviews").select(SUMMARY).order("sort_order");
  if (e2 || !rows) return [];
  return (rows as Row[]).map(toSummary);
}

export type ReviewAccess = {
  exists: boolean;
  /** Free-tier limits apply to the caller. */
  limited: boolean;
  perDay: number;
  minutes: number;
  /** Reviews the caller opened today, this one included. */
  usedToday: number;
  /** Limited, not opened today, and an allowance left: the page offers "Start". */
  quotaLeft: boolean;
  openedAt: string | null;
  /** Limited callers only: when this review's window closes. */
  expiresAt: string | null;
  read: boolean;
  xp: number;
  /** Ranking v2 rules are live, so reading pays now (otherwise it is logged in shadow mode). */
  xpLive: boolean;
  minSeconds: number;
  isStudent: boolean;
};

/** The caller's standing with one review. Null on a database without 20261022160000 (no limits, no reading XP there). */
export async function reviewAccess(slug: string): Promise<ReviewAccess | null> {
  const { data, error } = await createClient().rpc("topic_review_access", { p_slug: slug });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const n = (v: unknown, f = 0) => (typeof v === "number" ? v : f);
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    exists: d.exists === true, limited: d.limited === true, perDay: n(d.per_day, 1), minutes: n(d.minutes, 5),
    usedToday: n(d.used_today), quotaLeft: d.quota_left === true, openedAt: s(d.opened_at), expiresAt: s(d.expires_at),
    read: d.read === true, xp: n(d.xp), xpLive: d.xp_live === true, minSeconds: n(d.min_seconds, 180), isStudent: d.is_student === true,
  };
}

/** Reviews a question can link to: the published ones (never a draft). A free student out of review time still gets the
 *  link; the page offers the upgrade or tomorrow's review instead of the content. */
export async function publishedReviewLinks(): Promise<ReviewLink[]> {
  return (await listReviews())
    .filter((r) => r.status === "published")
    .map(({ slug, title, keywords, exclude }) => ({ slug, title, keywords, exclude }));
}

export async function getReview(slug: string): Promise<ReviewFull | null> {
  const { data, error } = await createClient()
    .from("topic_reviews")
    .select(`${SUMMARY}, slides, question, published_at`)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Row & { slides: ReviewSlide[]; question: ReviewQuestion | null; published_at: string | null };
  return { ...toSummary(r), slides: r.slides ?? [], question: r.question, publishedAt: r.published_at };
}

/** Live standalone questions that belong to a review (same rule as the question-side link), shuffled. */
export async function reviewQuestionIds(review: Pick<ReviewLink, "slug" | "keywords" | "exclude">): Promise<string[]> {
  const { data, error } = await createClient().rpc("topic_review_candidates", { p_slug: review.slug });
  if (error || !data) return [];
  return (data as { id: string; body: string; topic_name: string | null }[])
    .filter((q) => linkScore({ body: q.body, topicName: q.topic_name }, review) >= MIN_LINK_SCORE)
    .map((q) => q.id)
    .sort(() => Math.random() - 0.5);
}
