"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function back(id: string, error?: string): never {
  revalidatePath(`/teacher/case-studies/${id}`);
  revalidatePath("/teacher/case-studies");
  revalidatePath("/study/case-studies");
  redirect(`/teacher/case-studies/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

/** Record clinical validation (V3 s.14). Required before a case can be published. */
export async function validateCase(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const { user } = await requireRole("teacher", `/teacher/case-studies/${id}`);
  if (!note) back(id, "Add a short validation note: who checked what, against which source.");
  const { error } = await createClient().from("case_studies").update({
    validation_status: "validated", validated_by: user.id, validated_at: new Date().toISOString(), validation_note: note,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  back(id, error?.message);
}

/** Move a case through review. Publishing also requires validation; the database refuses otherwise. */
export async function setCaseStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "");
  await requireRole("teacher", `/teacher/case-studies/${id}`);
  const patch =
    to === "publish" ? { status: "approved", is_active: true } :
    to === "unpublish" ? { is_active: false } :
    to === "in_review" ? { status: "in_review", is_active: false } :
    to === "archived" ? { status: "archived", is_active: false } : null;
  if (!patch) back(id, "Unknown action.");
  const { error } = await createClient().from("case_studies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  back(id, error ? (error.message.includes("publish_requires_validation") ? "Record clinical validation before publishing." : error.message) : undefined);
}
