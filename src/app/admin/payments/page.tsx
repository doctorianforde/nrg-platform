import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { fmtDay, METHOD_LABEL, ttd } from "@/lib/membership/queries";
import { ApproveForm, BankSettingsForm, RefundForm, RejectForm, RevokeForm } from "./PaymentForms";

export const dynamic = "force-dynamic";

type Req = {
  id: string; user_id: string; name: string | null; email: string | null; plan_code: string; plan_name: string; plan_months: number;
  amount_ttd: number; paid_on: string; method: string; reference: string; receipt_path: string; status: "pending" | "approved" | "rejected";
  submitted_at: string; reviewed_at: string | null; reject_reason: string | null; refund_on: string | null; refund_reference: string | null;
  receipt_check: { result: "clear" | "flagged" | "error"; warnings: string[] } | null; current_expires_at: string | null;
};
type Mem = { user_id: string; name: string | null; email: string | null; plan_name: string; status: "active" | "revoked"; starts_at: string; expires_at: string; revoked_reason: string | null };
const TABS = [
  { key: "pending", label: "Pending" },
  { key: "expiring", label: "Ending in 7 days" },
  { key: "active", label: "Active" },
  { key: "decided", label: "Decided" },
  { key: "settings", label: "Bank details" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Payments by bank transfer (2026-11-09): approve or reject receipts, see who is active, set the bank details. */
export default async function PaymentsPage({ searchParams }: { searchParams: { tab?: string; done?: string } }) {
  const { user, profile } = await requireRole("admin", "/admin/payments");
  const supabase = createClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.rpc("membership_admin_overview"),
    supabase.from("membership_settings").select("key, value"),
  ]);
  const overview = (data ?? null) as unknown as { requests: Req[]; memberships: Mem[] } | null;
  const tab: Tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? "pending") as Tab;
  const now = Date.now();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port_of_Spain" }).format(new Date());

  const shell = (children: React.ReactNode) => (
    <DashboardShell profile={profile} email={user.email} title="Payments" eyebrow="Administration" subtitle="Students pay by bank transfer and upload a receipt. Approve only after you find the payment on NRG's bank statement.">
      {children}
    </DashboardShell>
  );
  if (error || !overview) return shell(<EmptyState title="Not available yet" body="Payments need their database update on this environment." />);

  const pending = overview.requests.filter((r) => r.status === "pending").sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const decided = overview.requests.filter((r) => r.status !== "pending");
  const live = overview.memberships.filter((m) => m.status === "active" && Date.parse(m.expires_at) > now);
  const expiring = live.filter((m) => Date.parse(m.expires_at) - now <= 7 * 86_400_000);
  const expired = overview.memberships.filter((m) => m.status === "active" && Date.parse(m.expires_at) <= now);

  // Receipts open through 10-minute signed links (R10); the admin's own session may read the private bucket.
  const links = new Map<string, string>();
  if (tab === "pending" || tab === "decided") {
    const paths = (tab === "pending" ? pending : decided).map((r) => r.receipt_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("payment-receipts").createSignedUrls(paths, 600);
      (signed ?? []).forEach((s) => s.path && s.signedUrl && links.set(s.path, s.signedUrl));
    }
  }

  return shell(
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Waiting to be checked" value={pending.length} iconTone="purple" />
        <StatCard label="Ending in 7 days" value={expiring.length} iconTone="amber" />
        <StatCard label="Active plans" value={live.length} iconTone="green" />
        <StatCard label="Expired" value={expired.length} iconTone="blue" />
      </div>

      {searchParams.done ? (
        <p role="status" className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">{searchParams.done.slice(0, 200)}</p>
      ) : null}

      <nav className="mt-6 flex flex-wrap gap-1 rounded-xl border border-border/80 bg-card p-1" aria-label="Payments sections">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/payments?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === t.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}{t.key === "pending" && pending.length ? ` (${pending.length})` : ""}
          </Link>
        ))}
      </nav>

      <div className="mt-5 space-y-4">
        {tab === "pending" ? (
          pending.length === 0 ? <EmptyState title="Nothing to check" body="New payments appear here as students send them." /> :
          pending.map((r) => (
            <Card key={r.id}>
              <RequestHeader r={r} link={links.get(r.receipt_path)} />
              <ReceiptCheckPanel r={r} />
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approve</p>
                  <ApproveForm requestId={r.id} flagged={r.receipt_check?.result === "flagged"} months={r.plan_months} currentExpiresAt={r.current_expires_at} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or reject</p>
                  <RejectForm requestId={r.id} />
                </div>
              </div>
            </Card>
          ))
        ) : null}

        {tab === "expiring" || tab === "active" ? (
          (tab === "expiring" ? expiring : live).length === 0 ? (
            <EmptyState title={tab === "expiring" ? "No plans end in the next 7 days" : "No active plans yet"} body="" />
          ) : (
            <Card>
              <ul className="divide-y divide-border/70">
                {(tab === "expiring" ? expiring : live).map((m) => (
                  <li key={m.user_id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-card-foreground">{m.name || "Unnamed student"}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.email} · {m.plan_name}</p>
                      </div>
                      <p className="text-sm text-card-foreground">Until <strong>{fmtDay(m.expires_at)}</strong></p>
                    </div>
                    <RevokeForm userId={m.user_id} />
                  </li>
                ))}
              </ul>
            </Card>
          )
        ) : null}

        {tab === "decided" ? (
          decided.length === 0 ? <EmptyState title="No decisions in the last 90 days" body="" /> :
          decided.map((r) => (
            <Card key={r.id}>
              <RequestHeader r={r} link={links.get(r.receipt_path)} />
              {r.status === "rejected" ? (
                <div className="mt-3 text-sm">
                  <p className="text-card-foreground"><span className="text-muted-foreground">Reason:</span> {r.reject_reason}</p>
                  {r.refund_on ? (
                    <p className="mt-1 text-muted-foreground">Refunded {fmtDay(r.refund_on)}, ref {r.refund_reference}.</p>
                  ) : (
                    <RefundForm requestId={r.id} today={today} />
                  )}
                </div>
              ) : null}
            </Card>
          ))
        ) : null}

        {tab === "settings" ? (
          <Card>
            <CardTitle>Bank details students see</CardTitle>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Payments stay closed until the bank, account name and account number are filled in.</p>
            <BankSettingsForm values={Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]))} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function RequestHeader({ r, link }: { r: Req; link?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-card-foreground">{r.name || "Unnamed student"}</p>
        <p className="truncate text-xs text-muted-foreground">{r.email}</p>
        <p className="mt-2 text-sm text-card-foreground">
          <strong>{r.plan_name}</strong> · {ttd(Number(r.amount_ttd))} · {METHOD_LABEL[r.method] ?? r.method} on {fmtDay(r.paid_on)}
        </p>
        <p className="text-sm text-card-foreground">Reference: <span className="font-mono">{r.reference}</span></p>
        <p className="text-xs text-muted-foreground">Sent {new Date(r.submitted_at).toLocaleString("en-GB", { timeZone: "America/Port_of_Spain" })}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {r.status !== "pending" ? <Badge tone={r.status === "approved" ? "green" : "red"} dot>{r.status === "approved" ? "Approved" : "Rejected"}</Badge> : null}
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-card-foreground hover:bg-muted">
            Open receipt
          </a>
        ) : <span className="text-xs text-muted-foreground">Receipt no longer kept</span>}
      </div>
    </div>
  );
}

/** R11 panel, above the checklist so warnings are read first. Four states, plus "still checking" for 10 minutes. */
function ReceiptCheckPanel({ r }: { r: Req }) {
  const c = r.receipt_check;
  const age = Date.now() - Date.parse(r.submitted_at);
  const base = "mt-4 rounded-xl border p-3 text-sm";
  if (!c) {
    return age < 10 * 60_000
      ? <p className={`${base} border-border bg-muted/60 text-muted-foreground`}>Receipt check: still checking.</p>
      : <p className={`${base} border-border bg-muted/60 text-muted-foreground`}>Receipt check: not checked. Match it to the bank statement as usual.</p>;
  }
  if (c.result === "error") return <p className={`${base} border-amber-200 bg-amber-50 text-amber-900`}>Receipt check couldn&apos;t run. {c.warnings[0] ?? ""}</p>;
  if (c.result === "clear") {
    return (
      <p className={`${base} border-green-200 bg-green-50 text-green-900`}>
        Receipt check: nothing found. That isn&apos;t proof it&apos;s genuine; the bank statement is.
      </p>
    );
  }
  return (
    <div className={`${base} border-red-200 bg-red-50 text-red-900`}>
      <p className="font-semibold">Receipt check: warnings</p>
      <ul className="mt-1 list-disc pl-5">{c.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      <p className="mt-1">Approve only if you find the payment on the bank statement itself.</p>
    </div>
  );
}
