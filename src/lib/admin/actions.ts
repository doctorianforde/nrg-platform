"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "./email";

export type AdminState = { error: string } | { ok: string } | null;

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

type Actor = { id: string; isSuper: boolean };

/** Every action below is admin-only; super_admin is required to touch a super_admin. */
async function requireAdmin(): Promise<Actor | { error: string }> {
  const session = await getSession();
  const role = session?.profile?.role;
  if (!session || (role !== "admin" && role !== "super_admin")) {
    return { error: "You don't have permission to do that." };
  }
  return { id: session.user.id, isSuper: role === "super_admin" };
}

type TargetProfile = { id: string; role: string; full_name: string | null };

/** Guards shared by every action that targets another account. */
async function targetFor(
  actor: Actor,
  userId: string
): Promise<{ error: string } | { target: TargetProfile }> {
  if (!userId) return { error: "No account selected." };
  if (userId === actor.id) return { error: "You can't do that to your own account." };
  const { data: target } = await adminClient
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (target.role === "super_admin" && !actor.isSuper) {
    return { error: "Only a super admin can change another super admin." };
  }
  return { target };
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/super-admin");
}

/**
 * Called from the signup form right after sign-up, before the address is
 * confirmed, so it can't require a session. It emails nothing unless the address
 * really does have a pending teacher request, which stops it being used to send
 * mail to the admins on demand.
 */
export async function notifyTeacherRequest(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!address) return;

  const { data: users } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = users?.users.find((u) => u.email?.toLowerCase() === address);
  if (!user) return;

  const { data: request } = await adminClient
    .from("role_requests")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (!request) return;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nrg-platform.vercel.app";
  await notifyAdmins({
    subject: "NRG — a teacher account is waiting for approval",
    heading: "Someone has asked for teacher access",
    lines: [
      `Name: ${profile?.full_name?.trim() || "(not given)"}`,
      `Email: ${address}`,
      "They have a student account until one of you approves the request.",
    ],
    actionUrl: `${site}/admin`,
  });
}

export async function decideRequest(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  if ("error" in actor) return actor;

  const requestId = field(fd, "request_id");
  const approve = field(fd, "decision") === "approve";
  const note = field(fd, "note");

  const { error } = await createClient().rpc("decide_role_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note || undefined,
  });
  if (error) return { error: `Could not save that decision: ${error.message}` };

  refresh();
  return { ok: approve ? "Teacher access granted." : "Request denied." };
}

export async function setRole(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  if ("error" in actor) return actor;
  const found = await targetFor(actor, field(fd, "user_id"));
  if ("error" in found) return found;

  const role = field(fd, "role");
  if (!["student", "teacher", "admin"].includes(role)) return { error: "Unknown role." };
  if (role === "admin" && !actor.isSuper) return { error: "Only a super admin can create admins." };

  const { error } = await adminClient.from("profiles").update({ role }).eq("id", found.target.id);
  if (error) return { error: `Could not change that role: ${error.message}` };

  refresh();
  return { ok: `${found.target.full_name ?? "That account"} is now a ${role.replace("_", " ")}.` };
}

/** Suspend at the auth layer (blocks sign-in) and record it where the app can see it. */
export async function setSuspended(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  if ("error" in actor) return actor;
  const found = await targetFor(actor, field(fd, "user_id"));
  if ("error" in found) return found;

  const suspend = field(fd, "suspend") === "1";
  const { error: banError } = await adminClient.auth.admin.updateUserById(found.target.id, {
    ban_duration: suspend ? "87600h" : "none",
  });
  if (banError) return { error: `Could not change sign-in access: ${banError.message}` };

  const { error } = await adminClient
    .from("profiles")
    .update({ suspended_at: suspend ? new Date().toISOString() : null })
    .eq("id", found.target.id);
  if (error) return { error: `Sign-in was changed but the record didn't save: ${error.message}` };

  refresh();
  return { ok: suspend ? "Account suspended — they can no longer sign in." : "Account restored." };
}

/**
 * Permanent. The account's own history goes with it (attempts, messages); any
 * questions they wrote stay, unattributed. Owning an exam set blocks deletion —
 * a paper other students have sat shouldn't disappear with its author.
 */
export async function deleteAccount(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  if ("error" in actor) return actor;
  const found = await targetFor(actor, field(fd, "user_id"));
  if ("error" in found) return found;

  const { count } = await adminClient
    .from("mock_exam_sets")
    .select("id", { count: "exact", head: true })
    .eq("created_by", found.target.id);
  if ((count ?? 0) > 0) {
    return {
      error: `This account owns ${count} mock exam set${count === 1 ? "" : "s"}, so deleting it would take those papers with it. Suspend the account instead, or reassign the sets first.`,
    };
  }

  const { error } = await adminClient.auth.admin.deleteUser(found.target.id);
  if (error) return { error: `Could not delete that account: ${error.message}` };

  refresh();
  return { ok: `${found.target.full_name ?? "That account"} has been deleted.` };
}
