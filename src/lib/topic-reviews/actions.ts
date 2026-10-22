"use server";

import { revalidatePath } from "next/cache";
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
