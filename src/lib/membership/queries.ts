import { createClient } from "@/lib/supabase/server";

/** Paid plans by bank transfer (20261109180000). Everything here degrades to empty on a database without it. */

export type Plan = { code: string; name: string; months: number; priceTtd: number };
export type BankSettings = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  referenceHint: string;
  turnaroundDays: string;
  /** False until the account details are filled in; the pay form stays closed until then. */
  ready: boolean;
};
export type MembershipRequest = {
  id: string;
  planCode: string;
  amountTtd: number;
  paidOn: string;
  method: string;
  reference: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  refundOn: string | null;
};
export type Membership = { planCode: string; status: "active" | "revoked"; startsAt: string; expiresAt: string; revokedReason: string | null };

export const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer",
  online_banking: "Online banking",
  cash_deposit: "Cash deposit at the bank",
};

export const ttd = (n: number) => `TT$${n.toLocaleString("en-TT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export async function loadPlans(): Promise<Plan[]> {
  const { data } = await createClient().from("membership_plans").select("code, name, months, price_ttd").order("sort_order");
  return (data ?? []).map((p) => ({ code: p.code, name: p.name, months: p.months, priceTtd: Number(p.price_ttd) }));
}

export async function loadBankSettings(): Promise<BankSettings> {
  const { data } = await createClient().from("membership_settings").select("key, value");
  const m = new Map((data ?? []).map((r) => [r.key, r.value]));
  const v = (k: string) => (m.get(k) ?? "").trim();
  return {
    bankName: v("bank_name"),
    accountName: v("account_name"),
    accountNumber: v("account_number"),
    branch: v("branch"),
    referenceHint: v("reference_hint") || "Your NRG email address",
    turnaroundDays: v("turnaround_days") || "2",
    ready: !!(v("bank_name") && v("account_name") && v("account_number")),
  };
}

/** The signed-in student's membership (if any) and their requests, newest first. */
export async function loadMyMembership(userId: string): Promise<{ membership: Membership | null; requests: MembershipRequest[] }> {
  const supabase = createClient();
  const [{ data: m }, { data: reqs }] = await Promise.all([
    supabase.from("memberships").select("plan_code, status, starts_at, expires_at, revoked_reason").eq("user_id", userId).maybeSingle(),
    supabase
      .from("membership_requests")
      .select("id, plan_code, amount_ttd, paid_on, method, reference, status, submitted_at, reviewed_at, reject_reason, refund_on")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);
  return {
    membership: m ? { planCode: m.plan_code, status: m.status as Membership["status"], startsAt: m.starts_at, expiresAt: m.expires_at, revokedReason: m.revoked_reason } : null,
    requests: (reqs ?? []).map((r) => ({
      id: r.id, planCode: r.plan_code, amountTtd: Number(r.amount_ttd), paidOn: r.paid_on, method: r.method, reference: r.reference,
      status: r.status as MembershipRequest["status"], submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, rejectReason: r.reject_reason, refundOn: r.refund_on,
    })),
  };
}

/** Active and not yet expired (R1). */
export const isActive = (m: Membership | null) => !!m && m.status === "active" && Date.parse(m.expiresAt) > Date.now();

/** A date for people: Trinidad time for timestamps; a date-only value ("2026-11-09") as written, with no time-zone
 *  shift (read as midnight UTC it would show the day before in Trinidad). */
export const fmtDay = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Port_of_Spain" });
