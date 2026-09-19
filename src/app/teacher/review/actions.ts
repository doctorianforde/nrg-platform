"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { COGNITIVE_LEVELS, DIFFICULTIES, filtersToQuery, parseFilters } from "@/lib/review/filters";
import { findNextId } from "@/lib/review/queue";
import type { Database } from "@/lib/supabase/types";

export type ReviewState = { error: string } | null;

const DECISIONS = ["approve", "needs_changes", "reject", "reset", "save"] as const;
type Decision = (typeof DECISIONS)[number];

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function submitReview(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const id = str(fd, "id");
  const decision = str(fd, "decision") as Decision;
  const filters = parseFilters(Object.fromEntries(new URLSearchParams(str(fd, "qs"))));
  const qs = filtersToQuery(filters);
  const { user } = await requireRole("teacher", `/teacher/review/${id}`);
  const supabase = createClient();

  if (!DECISIONS.includes(decision)) return { error: "Unknown action." };

  const { data: current } = await supabase
    .from("questions")
    .select("id, is_ai_generated, question_type, updated_at, question_options(id)")
    .eq("id", id)
    .maybeSingle();
  if (!current || !current.is_ai_generated) return { error: "Question not found." };
  if (current.updated_at !== str(fd, "updated_at")) {
    return { error: "Someone changed this question after you opened it. Reload the page to see the latest version, then try again." };
  }

  const notes = str(fd, "notes").trim();
  if (decision === "needs_changes" && !notes) return { error: "Add a note saying what needs to change." };

  const now = new Date().toISOString();
  const update: Database["public"]["Tables"]["questions"]["Update"] = { updated_at: now };

  if (str(fd, "edited") === "1") {
    const body = str(fd, "body").trim();
    const explanation = str(fd, "explanation").trim();
    const cognitive = str(fd, "cognitive_level");
    const difficulty = str(fd, "difficulty");
    if (!body) return { error: "The question text can't be empty." };
    if (!(COGNITIVE_LEVELS as readonly string[]).includes(cognitive)) return { error: "Invalid cognitive level." };
    if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) return { error: "Invalid difficulty." };

    const optionIds = current.question_options.map((o) => o.id);
    const correct = new Set(fd.getAll("correct").map(String));
    if (!Array.from(correct).every((c) => optionIds.includes(c))) return { error: "Invalid answer selection." };
    if (current.question_type === "mcq" ? correct.size !== 1 : correct.size < 1) {
      return { error: current.question_type === "mcq" ? "Choose exactly one correct answer." : "Choose at least one correct answer." };
    }
    const options = optionIds.map((oid) => ({
      id: oid,
      body: str(fd, `opt_body_${oid}`).trim(),
      rationale: str(fd, `opt_rationale_${oid}`).trim() || null,
      is_correct: correct.has(oid),
    }));
    if (options.some((o) => !o.body)) return { error: "Answer options can't be empty." };

    // Options first: if any fail, the question row (and its review status) is left untouched.
    const results = await Promise.all(
      options.map(({ id: oid, ...fields }) =>
        supabase.from("question_options").update(fields).eq("id", oid).eq("question_id", id).select("id")
      )
    );
    const failed = results.find((r) => r.error || r.data?.length !== 1);
    if (failed) return { error: `Could not save the answer options${failed.error ? `: ${failed.error.message}` : " (not permitted)"}.` };

    Object.assign(update, {
      body,
      explanation: explanation || null,
      cognitive_level: cognitive,
      difficulty,
    });
  }

  update.review_notes = notes || null;
  switch (decision) {
    case "approve":
      Object.assign(update, { review_status: "approved", is_active: true, reviewed_by: user.id, reviewed_at: now });
      break;
    case "needs_changes":
      Object.assign(update, { review_status: "needs_changes", is_active: false, reviewed_by: user.id, reviewed_at: now });
      break;
    case "reject":
      Object.assign(update, { review_status: "rejected", is_active: false, reviewed_by: user.id, reviewed_at: now });
      break;
    case "reset":
      Object.assign(update, { review_status: "pending", is_active: false, reviewed_by: null, reviewed_at: null });
      break;
    case "save":
      break;
  }

  const { data: saved, error } = await supabase
    .from("questions")
    .update(update)
    .eq("id", id)
    .eq("updated_at", current.updated_at)
    .select("id");
  if (error) return { error: `Could not save: ${error.message}` };
  if (saved?.length !== 1) return { error: "Could not save — the question changed or you don't have permission." };

  revalidatePath("/teacher/review");
  if (decision === "save") {
    revalidatePath(`/teacher/review/${id}`);
    redirect(`/teacher/review/${id}${qs}${qs ? "&" : "?"}saved=1`);
  }
  const nextId = await findNextId(supabase, filters, id);
  redirect(nextId ? `/teacher/review/${nextId}${qs}` : `/teacher/review${qs}`);
}
