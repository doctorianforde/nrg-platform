"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type SharingActionState = { ok?: string; error?: string } | null;

async function asAdmin() {
  const session = await getSession();
  return session?.profile && hasAtLeast(session.profile.role, "admin") ? session : null;
}

/** Mark a student's sharing signals as reviewed; they flag again only on activity after this moment. */
export async function markSharingReviewed(_prev: SharingActionState, fd: FormData): Promise<SharingActionState> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const userId = String(fd.get("userId") ?? "");
  const note = String(fd.get("note") ?? "").slice(0, 500);
  const { error } = await createClient().rpc("mark_sharing_reviewed", { p_user: userId, p_note: note || undefined });
  if (error) return { error: "Could not save the review. Try again." };
  revalidatePath("/admin/sharing");
  return { ok: "Marked as reviewed." };
}

/** Update the two flag thresholds (whole numbers, 1–100; the database checks too). */
export async function saveSharingThresholds(_prev: SharingActionState, fd: FormData): Promise<SharingActionState> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const bumps = Number(fd.get("bumps_per_day"));
  const devices = Number(fd.get("devices_per_week"));
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100;
  if (!ok(bumps) || !ok(devices)) return { error: "Use whole numbers from 1 to 100." };
  const supabase = createClient();
  const [a, b] = await Promise.all([
    supabase.rpc("set_account_guard_config", { p_key: "bumps_per_day", p_value: bumps }),
    supabase.rpc("set_account_guard_config", { p_key: "devices_per_week", p_value: devices }),
  ]);
  if (a.error || b.error) return { error: "Could not save the thresholds. Try again." };
  revalidatePath("/admin/sharing");
  return { ok: "Thresholds saved." };
}
