import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtDay, isActive, loadBankSettings, loadMyMembership, loadPlans, METHOD_LABEL, ttd } from "@/lib/membership/queries";

export const dynamic = "force-dynamic";

/** The student's plan: what they have, until when, and every payment they have sent (2026-11-09). */
export default async function MyPlanPage() {
  const { user, profile } = await requireRole("student", "/study/plan");
  const [{ membership, requests }, plans, bank] = await Promise.all([loadMyMembership(user.id), loadPlans(), loadBankSettings()]);
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code;
  const staff = hasAtLeast(profile.role, "teacher");
  const active = isActive(membership);
  const daysLeft = active ? Math.ceil((Date.parse(membership!.expiresAt) - Date.now()) / 86_400_000) : 0;
  const pending = requests.find((r) => r.status === "pending");
  const lastRejected = requests.find((r) => r.status !== "pending");

  return (
    <DashboardShell profile={profile} email={user.email} title="My plan" eyebrow="Account" subtitle="Your plan, when it ends, and the payments you have sent.">
      {staff ? (
        <Card className="mb-6"><p className="text-sm text-muted-foreground">Staff accounts have full access and never need a plan.</p></Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>{active ? `${planName(membership!.planCode)} plan` : "Free plan"}</CardTitle>
            {active ? (
              <Badge tone={daysLeft <= 7 ? "amber" : "green"} dot>{daysLeft <= 7 ? `Ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Active"}</Badge>
            ) : membership?.status === "revoked" ? (
              <Badge tone="red" dot>Ended by NRG</Badge>
            ) : membership ? (
              <Badge tone="gray" dot>Expired</Badge>
            ) : null}
          </div>
          {active ? (
            <>
              <p className="mt-2 text-sm text-card-foreground">Full access until <strong>{fmtDay(membership!.expiresAt)}</strong>.</p>
              <ExpiryMeter startsAt={membership!.startsAt} expiresAt={membership!.expiresAt} />
              {daysLeft <= 7 ? <p className="mt-3 text-sm text-muted-foreground">Renew now and the new time is added after {fmtDay(membership!.expiresAt)}.</p> : null}
            </>
          ) : membership?.status === "revoked" ? (
            <p className="mt-2 text-sm text-muted-foreground">NRG ended this plan{membership.revokedReason ? `: ${membership.revokedReason}` : "."} Contact NRG if you think this is a mistake.</p>
          ) : membership ? (
            <p className="mt-2 text-sm text-muted-foreground">Your plan ended on {fmtDay(membership.expiresAt)}. You&apos;re back on the free plan.</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">You&apos;re on the free plan. Upgrade for unlimited practice, mock exams and case studies.</p>
          )}

          {pending ? (
            <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              <p className="font-semibold text-card-foreground">We&apos;re checking your payment</p>
              <p className="mt-1 text-muted-foreground">
                {planName(pending.planCode)}, {ttd(pending.amountTtd)}, paid {fmtDay(pending.paidOn)}. We match receipts to the bank statement within {bank.turnaroundDays} working days.
              </p>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/study/plan/pay" className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover">
                {active ? "Renew" : "Upgrade"}
              </Link>
              <Link href="/plans" className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-card-foreground hover:bg-muted">Compare plans</Link>
            </div>
          )}
          {!pending && lastRejected?.status === "rejected" ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">Your last payment was not approved</p>
              <p className="mt-1">{lastRejected.rejectReason}</p>
              <p className="mt-1 text-red-800/80">Fix it and send the receipt again, or contact NRG.{lastRejected.refundOn ? ` Refunded on ${fmtDay(lastRejected.refundOn)}.` : ""}</p>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardTitle className="text-sm">Payments you&apos;ve sent</CardTitle>
          {requests.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border/70 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-card-foreground">{planName(r.planCode)} · {ttd(r.amountTtd)}</span>
                    <Badge tone={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "purple"}>
                      {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Not approved" : "Checking"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{METHOD_LABEL[r.method] ?? r.method} · paid {fmtDay(r.paidOn)} · ref {r.reference}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}

function ExpiryMeter({ startsAt, expiresAt }: { startsAt: string; expiresAt: string }) {
  const total = Date.parse(expiresAt) - Date.parse(startsAt);
  const left = Math.max(0, Date.parse(expiresAt) - Date.now());
  const pct = total > 0 ? Math.round((left / total) * 100) : 0;
  return (
    <div className="mt-4" role="img" aria-label={`${pct}% of your plan left`}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{pct}% of your plan left</p>
    </div>
  );
}
