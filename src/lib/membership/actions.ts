"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { checkReceipt } from "./receipt-check";
import { emailDecisionToStudent, emailNewPaymentToAdmins, emailPlanEnded } from "./emails";

export type ActionResult = { ok?: string; error?: string } | null;

/** After a decision the request leaves its list (its card unmounts), so confirm on the page itself via ?done=. */
const doneTo = (tab: string, message: string): never => redirect(`/admin/payments?tab=${tab}&done=${encodeURIComponent(message)}`);

/** Turn a database refusal into the sentence the student or admin should see. */
const said = (message: string | undefined, fallback: string) =>
  message && !/permission denied|violates|syntax|function/i.test(message) ? message.charAt(0).toUpperCase() + message.slice(1) + "." : fallback;

/**
 * Student: create the request for a receipt they have already uploaded (the browser uploads straight into their own
 * folder of the private bucket). The database checks everything (submit_membership_request); then the receipt check
 * runs here on the server and saves its result on the request (R11). The check never blocks the submission.
 */
export async function submitMembershipRequest(input: {
  plan: string;
  paidOn: string;
  method: string;
  reference: string;
  receiptPath: string;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.profile) return { error: "Please sign in again." };
  const { data, error } = await createClient().rpc("submit_membership_request", {
    p_plan: input.plan,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_reference: input.reference,
    p_receipt_path: input.receiptPath,
  });
  if (error || !data) return { error: said(error?.message, "Could not send your payment details. Try again.") };
  const requestId = (data as { id: string }).id;
  await checkReceipt(requestId);
  await emailNewPaymentToAdmins(requestId); // never throws; the admin page lists it either way
  revalidatePath("/study/plan");
  return { ok: "Sent. We'll check your payment against the bank statement." };
}

async function asAdmin() {
  const session = await getSession();
  return session?.profile && hasAtLeast(session.profile.role, "admin") ? session : null;
}

export async function approveMembership(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const tick = (k: string) => fd.get(k) === "on";
  const { data, error } = await createClient().rpc("approve_membership", {
    p_request: String(fd.get("requestId")),
    p_checklist: {
      payment_found: tick("payment_found"),
      amount_matches: tick("amount_matches"),
      plan_correct: tick("plan_correct"),
      warnings_reviewed: tick("warnings_reviewed"),
    },
  });
  if (error) return { error: said(error.message, "Could not approve. Try again.") };
  revalidatePath("/admin/payments");
  const exp = (data as { expires_at?: string } | null)?.expires_at;
  await emailDecisionToStudent(String(fd.get("requestId")), exp);
  return doneTo("pending", exp ? `Approved. Access until ${new Date(exp).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Port_of_Spain" })}.` : "Approved.");
}

export async function rejectMembership(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const { error } = await createClient().rpc("reject_membership", { p_request: String(fd.get("requestId")), p_reason: String(fd.get("reason") ?? "") });
  if (error) return { error: said(error.message, "Could not reject. Try again.") };
  revalidatePath("/admin/payments");
  await emailDecisionToStudent(String(fd.get("requestId")));
  return doneTo("pending", "Rejected. The student sees your reason on their plan page.");
}

export async function revokeMembership(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const { error } = await createClient().rpc("revoke_membership", { p_user: String(fd.get("userId")), p_reason: String(fd.get("reason") ?? "") });
  if (error) return { error: said(error.message, "Could not revoke. Try again.") };
  revalidatePath("/admin/payments");
  await emailPlanEnded(String(fd.get("userId")), String(fd.get("reason") ?? "").trim());
  return doneTo("active", "Plan revoked.");
}

export async function recordRefund(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const { error } = await createClient().rpc("record_membership_refund", {
    p_request: String(fd.get("requestId")),
    p_on: String(fd.get("refundOn") ?? ""),
    p_reference: String(fd.get("refundReference") ?? ""),
  });
  if (error) return { error: said(error.message, "Could not record the refund. Try again.") };
  revalidatePath("/admin/payments");
  return doneTo("decided", "Refund recorded.");
}

const SETTING_KEYS = ["bank_name", "account_name", "account_number", "branch", "reference_hint", "turnaround_days"] as const;

export async function saveBankSettings(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  if (!(await asAdmin())) return { error: "Admins only." };
  const supabase = createClient();
  const results = await Promise.all(
    SETTING_KEYS.map((k) =>
      supabase.from("membership_settings").update({ value: String(fd.get(k) ?? "").trim().slice(0, 200) }).eq("key", k).select("key")
    )
  );
  if (results.some((r) => r.error || !r.data?.length)) return { error: "Could not save the bank details. Try again." };
  revalidatePath("/admin/payments");
  revalidatePath("/plans");
  return { ok: "Bank details saved. Students see them on the plans page." };
}
