import { createClient } from "@/lib/supabase/server";
import { linkScore, MIN_LINK_SCORE, type ReviewLink } from "./catalog";
import type { ReviewQuestion, ReviewSlide } from "./types";

export type ReviewSummary = ReviewLink & {
  id: string;
  system: string;
  status: "draft" | "published";
  related: string[];
  sortOrder: number;
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
};
const toSummary = (r: Row): ReviewSummary => ({
  id: r.id, slug: r.slug, title: r.title, system: r.system, status: r.status === "published" ? "published" : "draft",
  keywords: r.keywords ?? [], exclude: r.exclude ?? [], related: r.related ?? [], sortOrder: r.sort_order,
});

/**
 * Every review the caller may read: published ones for students, drafts as well for teaching staff (RLS decides).
 * Empty on a database without the topic_reviews migration.
 */
export async function listReviews(): Promise<ReviewSummary[]> {
  const { data, error } = await createClient().from("topic_reviews").select(SUMMARY).order("sort_order");
  if (error || !data) return [];
  return (data as Row[]).map(toSummary);
}

/** Reviews a question can link to: the published ones only, so a student is never sent to a page they can't open. */
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
