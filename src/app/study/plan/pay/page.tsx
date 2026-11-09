import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { fmtDay, isActive, loadBankSettings, loadMyMembership, loadPlans, ttd } from "@/lib/membership/queries";
import { PayForm } from "./PayForm";

export const dynamic = "force-dynamic";

/** Send a bank-transfer payment: pick the plan, pay, upload the receipt (2026-11-09). */
export default async function PayPage({ searchParams }: { searchParams: { plan?: string } }) {
  const { user, profile } = await requireRole("student", "/study/plan/pay");
  const [plans, bank, { membership, requests }] = await Promise.all([loadPlans(), loadBankSettings(), loadMyMembership(user.id)]);
  const pending = requests.find((r) => r.status === "pending");
  const active = isActive(membership);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port_of_Spain" }).format(new Date());

  return (
    <DashboardShell profile={profile} email={user.email} title={active ? "Renew your plan" : "Upgrade your plan"} eyebrow="Account" subtitle="Pay by bank transfer, then upload the receipt. We match it to the bank statement and your plan starts.">
      <div className="mx-auto max-w-2xl space-y-6">
        {profile.role !== "student" ? (
          <Card><p className="text-sm text-muted-foreground">Plans are for student accounts. Staff already have full access.</p></Card>
        ) : pending ? (
          <Card>
            <CardTitle>We&apos;re already checking a payment</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">You can send another once it has been checked.</p>
            <Link href="/study/plan" className="mt-3 inline-block text-sm font-medium text-brand-700 underline">See its status</Link>
          </Card>
        ) : !bank.ready ? (
          <Card>
            <CardTitle>Payments open soon</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">NRG&apos;s bank details are being finalised. Check back shortly.</p>
          </Card>
        ) : (
          <>
            {active ? (
              <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-card-foreground">
                Your plan runs until {fmtDay(membership!.expiresAt)}. A renewal adds its time after that date.
              </p>
            ) : null}
            <Card>
              <CardTitle>1. Pay into NRG&apos;s account</CardTitle>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Bank</dt><dd className="font-medium text-card-foreground">{bank.bankName}{bank.branch ? `, ${bank.branch}` : ""}</dd>
                <dt className="text-muted-foreground">Account name</dt><dd className="font-medium text-card-foreground">{bank.accountName}</dd>
                <dt className="text-muted-foreground">Account number</dt><dd className="font-medium tabular-nums text-card-foreground">{bank.accountNumber}</dd>
                <dt className="text-muted-foreground">Reference</dt><dd className="font-medium text-card-foreground">{bank.referenceHint}{bank.referenceHint.toLowerCase().includes("email") && user.email ? ` (${user.email})` : ""}</dd>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Prices: {plans.map((p) => `${p.name} ${ttd(p.priceTtd)}`).join(" · ")}. Pay the exact amount; a different amount can&apos;t be approved.
              </p>
            </Card>
            <Card>
              <CardTitle>2. Tell us about the payment</CardTitle>
              <PayForm userId={user.id} plans={plans} initialPlan={searchParams.plan} today={today} />
            </Card>
            <p className="text-xs text-muted-foreground">
              Your receipt is visible only to NRG admins and is deleted 90 days after it has been checked. It may show bank
              details, so don&apos;t upload anything else.
            </p>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
