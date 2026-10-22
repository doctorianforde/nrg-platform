"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type ReviewStatusState = { error: string } | { ok: string } | null;

/** Teaching staff publish or unpublish a review. RLS re-checks the role; the database stamps who and when. */
export async function setReviewStatus(_prev: ReviewStatusState, fd: FormData): Promise<ReviewStatusState> {
  const session = await getSession();
  if (!session?.profile || !hasAtLeast(session.profile.role, "teacher")) return { error: "Only teachers can publish reviews." };
  const slug = String(fd.get("slug") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!slug || (status !== "published" && status !== "draft")) return { error: "Nothing to change." };

  const { data, error } = await createClient().from("topic_reviews").update({ status }).eq("slug", slug).select("slug");
  if (error) return { error: `Could not save that: ${error.message}` };
  if (!data?.length) return { error: "That review no longer exists." };

  revalidatePath("/study/reviews");
  revalidatePath(`/study/reviews/${slug}`);
  return { ok: status === "published" ? "Published. Students can read it now." : "Back to draft. Students can no longer see it." };
}

export type OpenReviewState = { error: string } | null;

/** A free student starts their review for the day (the button on the review page). */
export async function openTopicReview(_prev: OpenReviewState, fd: FormData): Promise<OpenReviewState> {
  const session = await getSession();
  if (!session?.profile) return { error: "Sign in first." };
  const slug = String(fd.get("slug") ?? "");
  const { data, error } = await createClient().rpc("open_topic_review", { p_slug: slug });
  if (error) return { error: "Could not open the review. Try again." };
  const d = (data ?? {}) as { allowed?: boolean; reason?: string };
  if (!d.allowed) {
    return { error: d.reason === "quota" ? "You've already used today's free topic review." : "Your time with this review is up for today." };
  }
  revalidatePath("/study/reviews");
  redirect(`/study/reviews/${slug}`);
}

export type CompleteReviewResult =
  | { status: "read"; xp: number }
  | { status: "early"; secondsLeft: number }
  | { status: "already" | "staff" | "not_open" | "not_published" | "error" };

/** The student reached the end of a review: record the read and pay its XP (the database checks the time spent). */
export async function completeTopicReview(slug: string): Promise<CompleteReviewResult> {
  const session = await getSession();
  if (!session?.profile) return { status: "error" };
  const { data, error } = await createClient().rpc("complete_topic_review", { p_slug: slug });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { status: "error" };
  const d = data as { status?: string; xp?: number; seconds_left?: number };
  if (d.status === "read") {
    revalidatePath("/study/reviews");
    revalidatePath("/study/profile");
    return { status: "read", xp: d.xp ?? 0 };
  }
  if (d.status === "early") return { status: "early", secondsLeft: d.seconds_left ?? 0 };
  const known = ["already", "staff", "not_open", "not_published"] as const;
  return { status: (known as readonly string[]).includes(d.status ?? "") ? (d.status as (typeof known)[number]) : "error" };
}
