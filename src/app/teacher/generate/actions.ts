"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { readyToRun, validateRequest, type GenerationRequest } from "@/lib/generation/request";

export type QueueState = { error?: string; warnings?: string[] } | null;

/**
 * Queue a generation request. The browser sends the request JSON; everything is checked again here.
 * Pressing "Queue it" after reading the interpretation is Jade's confirmation, so a prompted request is stored
 * with interpretation.confirmed = true. The row is written with the teacher's own token (RLS: own row, queued).
 */
export async function queueRequest(_prev: QueueState, formData: FormData): Promise<QueueState> {
  const { user, profile } = await requireRole("teacher", "/teacher/generate");
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("request") ?? "")); } catch { return { error: "The request could not be read. Reload the page and try again." }; }

  const v = validateRequest(raw);
  if (!v.ok) return { error: v.errors.join(" · "), warnings: v.warnings };
  const req: GenerationRequest = { ...v.request, requested_by: profile.full_name ?? user.email ?? user.id };
  if (req.mode === "prompted") {
    if (!req.interpretation) return { error: "Read the prompt first (\"Check what I asked for\")." };
    req.interpretation = { ...req.interpretation, confirmed: true, at: new Date().toISOString() };
  }
  const blocked = readyToRun(req);
  if (blocked) return { error: blocked.charAt(0).toUpperCase() + blocked.slice(1) + "." };

  const { error } = await createClient().from("generation_requests").insert({
    kind: req.kind, mode: req.mode, request: req, status: "queued", requested_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/teacher/generate");
  // A fresh value each time so the page remounts the form empty for the next request.
  redirect(`/teacher/generate?queued=${Date.now()}`);
}

/** Cancel one of your own requests before it starts running (RLS refuses anything else). */
export async function cancelRequest(formData: FormData) {
  await requireRole("teacher", "/teacher/generate");
  const id = String(formData.get("id") ?? "");
  const { data, error } = await createClient()
    .from("generation_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["draft", "awaiting_confirmation", "queued"])
    .select("id");
  revalidatePath("/teacher/generate");
  const msg = error?.message ?? (data?.length ? null : "Only your own requests can be cancelled, and only before they start.");
  redirect(`/teacher/generate${msg ? `?error=${encodeURIComponent(msg)}` : ""}`);
}
