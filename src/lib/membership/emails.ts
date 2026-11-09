import { adminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "@/lib/admin/email";
import { sendEmail, siteUrl, type EmailOutcome } from "@/lib/mail/send";

// Server-side only. Emails for paid plans by bank transfer (phase 4 of the build plan). None of these ever throws, and
// every one repeats something the student or admin can also see on the site.

type ReqRow = {
  id: string; user_id: string; plan_code: string; amount_ttd: number; paid_on: string; method: string; reference: string;
  status: string; reject_reason: string | null; receipt_check: { result?: string; warnings?: string[] } | null;
};

const money = (n: number) => `TT$${Number(n).toLocaleString("en-TT")}`;
const day = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Port_of_Spain" });

async function load(requestId: string) {
  const { data } = await adminClient.from("membership_requests").select("*").eq("id", requestId).maybeSingle();
  if (!data) return null;
  const r = data as unknown as ReqRow;
  const [{ data: plan }, { data: prof }, { data: who }] = await Promise.all([
    adminClient.from("membership_plans").select("name").eq("code", r.plan_code).maybeSingle(),
    adminClient.from("profiles").select("full_name").eq("id", r.user_id).maybeSingle(),
    adminClient.auth.admin.getUserById(r.user_id),
  ]);
  return { r, plan: plan?.name ?? r.plan_code, name: prof?.full_name ?? null, email: who?.user?.email ?? null };
}

export async function emailNewPaymentToAdmins(requestId: string): Promise<EmailOutcome> {
  try {
    const x = await load(requestId);
    if (!x) return "skipped";
    const check = x.r.receipt_check?.result === "flagged"
      ? `Receipt check: warnings (${(x.r.receipt_check.warnings ?? []).join(" ")})`
      : x.r.receipt_check?.result === "clear" ? "Receipt check: nothing found." : "Receipt check: not available.";
    return await notifyAdmins({
      subject: `NRG: a payment to check (${x.plan}, ${money(x.r.amount_ttd)})`,
      heading: "A student has sent a payment",
      lines: [
        `${x.name ?? "A student"} (${x.email ?? "no email"}) paid ${money(x.r.amount_ttd)} for the ${x.plan} plan on ${day(x.r.paid_on)}, reference ${x.r.reference}.`,
        check,
        "Approve it only after you find the payment on NRG's bank statement.",
      ],
      actionUrl: `${siteUrl()}/admin/payments`,
      actionLabel: "Check the payment",
    });
  } catch (e) {
    console.error("emailNewPaymentToAdmins", e);
    return "failed";
  }
}

export async function emailDecisionToStudent(requestId: string, expiresAt?: string | null): Promise<EmailOutcome> {
  try {
    const x = await load(requestId);
    if (!x?.email) return "skipped";
    const hi = x.name ? `Hi ${x.name.split(" ")[0]},` : "Hi,";
    if (x.r.status === "approved") {
      return await sendEmail({
        to: x.email,
        subject: `Your NRG ${x.plan} plan is active`,
        heading: "Your payment is approved",
        lines: [
          hi,
          `We found your payment of ${money(x.r.amount_ttd)} and your ${x.plan} plan is now active${expiresAt ? `, until ${day(expiresAt)}` : ""}.`,
          "You now have unlimited practice, every topic review, mock exams and case studies. Good luck with your studies.",
        ],
        actionUrl: `${siteUrl()}/study`,
        actionLabel: "Start studying",
      });
    }
    if (x.r.status === "rejected") {
      return await sendEmail({
        to: x.email,
        subject: "Your NRG payment needs attention",
        heading: "We couldn't approve your payment",
        lines: [
          hi,
          `We checked your payment of ${money(x.r.amount_ttd)} for the ${x.plan} plan (reference ${x.r.reference}) and couldn't approve it.`,
          `Reason: ${x.r.reject_reason ?? "not given"}`,
          "You can fix it and send the receipt again from your plan page. If you think this is a mistake, reply to this email.",
        ],
        actionUrl: `${siteUrl()}/study/plan`,
        actionLabel: "Open my plan",
      });
    }
    return "skipped";
  } catch (e) {
    console.error("emailDecisionToStudent", e);
    return "failed";
  }
}

export async function emailPlanEnded(userId: string, reason: string): Promise<EmailOutcome> {
  try {
    const { data: who } = await adminClient.auth.admin.getUserById(userId);
    if (!who?.user?.email) return "skipped";
    return await sendEmail({
      to: who.user.email,
      subject: "Your NRG plan has been ended",
      heading: "NRG has ended your plan",
      lines: [`Reason: ${reason}`, "You're now on the free plan. If you think this is a mistake, reply to this email."],
      actionUrl: `${siteUrl()}/study/plan`,
      actionLabel: "Open my plan",
    });
  } catch (e) {
    console.error("emailPlanEnded", e);
    return "failed";
  }
}

/** R7: reminders 7 days and 1 day before expiry, recorded in memberships.reminded against that expiry so each is sent
 *  once, and a renewal (new expiry) starts afresh. Called by the daily job. */
export async function sendExpiryReminders(): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const now = Date.now();
  const { data } = await adminClient
    .from("memberships")
    .select("user_id, plan_code, expires_at, reminded, status")
    .eq("status", "active")
    .gt("expires_at", new Date(now).toISOString())
    .lte("expires_at", new Date(now + 7 * 86_400_000).toISOString());
  for (const m of (data ?? []) as unknown as { user_id: string; plan_code: string; expires_at: string; reminded: Record<string, string> }[]) {
    const left = Date.parse(m.expires_at) - now;
    const slot = left <= 86_400_000 ? "d1" : "d7";
    if (m.reminded?.[slot] === m.expires_at) continue;
    const { data: who } = await adminClient.auth.admin.getUserById(m.user_id);
    const email = who?.user?.email;
    const res: EmailOutcome = email
      ? await sendEmail({
          to: email,
          subject: slot === "d1" ? "Your NRG plan ends tomorrow" : "Your NRG plan ends in a week",
          heading: slot === "d1" ? "Your plan ends tomorrow" : "Your plan ends in a week",
          lines: [
            `Your plan ends on ${day(m.expires_at)}. After that you'll be back on the free plan.`,
            "Renew before then and the new time is added after that date, so you lose nothing.",
          ],
          actionUrl: `${siteUrl()}/study/plan/pay`,
          actionLabel: "Renew my plan",
        })
      : "skipped";
    out[res]++;
    if (res === "sent") {
      await adminClient.from("memberships").update({ reminded: { ...(m.reminded ?? {}), [slot]: m.expires_at } } as never).eq("user_id", m.user_id);
    }
  }
  return out;
}
