"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { approveMembership, recordRefund, rejectMembership, revokeMembership, saveBankSettings, type ActionResult } from "@/lib/membership/actions";

const btn = "rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50";
const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground";

function Submit({ label, tone = "primary", disabled = false }: { label: string; tone?: "primary" | "danger" | "plain"; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const cls = tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : tone === "plain" ? "border border-border bg-card text-card-foreground hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary-hover";
  return <button type="submit" disabled={pending || disabled} className={`${btn} ${cls}`}>{pending ? "Saving…" : label}</button>;
}
const Msg = ({ s }: { s: ActionResult }) =>
  s?.error ? <p role="alert" className="text-sm text-red-700">{s.error}</p> : s?.ok ? <p className="text-sm text-green-700">{s.ok}</p> : null;

/** R5 checklist + R11 extra tick, with a preview of the new expiry (R3/R4). The database re-checks everything. */
export function ApproveForm({ requestId, flagged, months, currentExpiresAt }: { requestId: string; flagged: boolean; months: number; currentExpiresAt: string | null }) {
  const [state, action] = useFormState(approveMembership, null);
  const [ticks, setTicks] = useState({ payment_found: false, amount_matches: false, plan_correct: false, warnings_reviewed: false });
  const ready = ticks.payment_found && ticks.amount_matches && ticks.plan_correct && (!flagged || ticks.warnings_reviewed);
  const base = currentExpiresAt && Date.parse(currentExpiresAt) > Date.now() ? new Date(currentExpiresAt) : new Date();
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== base.getDate()) next.setDate(0); // month-end, as the database does
  const item = (k: keyof typeof ticks, label: string) => (
    <label className="flex items-start gap-2 text-sm text-card-foreground">
      <input type="checkbox" name={k} checked={ticks[k]} onChange={(e) => setTicks((t) => ({ ...t, [k]: e.target.checked }))} className="mt-0.5 accent-[hsl(var(--primary))]" />
      {label}
    </label>
  );
  if (state?.ok) return <Msg s={state} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      {item("payment_found", "I found this payment on NRG's bank statement")}
      {item("amount_matches", "The amount matches the plan's price")}
      {item("plan_correct", "The plan is the one the student paid for")}
      {flagged ? item("warnings_reviewed", "The receipt has warnings: I found the payment on the bank statement itself, not just on this receipt") : null}
      <p className="text-xs text-muted-foreground">
        New expiry if approved: <strong>{next.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>
        {currentExpiresAt && Date.parse(currentExpiresAt) > Date.now() ? " (added after the current plan)" : ""}
      </p>
      <div className="flex items-center gap-3"><Submit label="Approve" disabled={!ready} /><Msg s={state} /></div>
    </form>
  );
}

export function RejectForm({ requestId }: { requestId: string }) {
  const [state, action] = useFormState(rejectMembership, null);
  if (state?.ok) return <Msg s={state} />;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <textarea name="reason" required maxLength={1000} rows={2} placeholder="Reason the student will see, e.g. payment not found on the statement" className={input} />
      <div className="flex items-center gap-3"><Submit label="Reject" tone="danger" /><Msg s={state} /></div>
    </form>
  );
}

export function RevokeForm({ userId }: { userId: string }) {
  const [state, action] = useFormState(revokeMembership, null);
  const [open, setOpen] = useState(false);
  if (state?.ok) return <Msg s={state} />;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-red-700 underline">Revoke…</button>;
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input name="reason" required maxLength={1000} placeholder="Reason" className={`${input} max-w-xs`} />
      <Submit label="Revoke plan" tone="danger" />
      <Msg s={state} />
    </form>
  );
}

export function RefundForm({ requestId, today }: { requestId: string; today: string }) {
  const [state, action] = useFormState(recordRefund, null);
  if (state?.ok) return <Msg s={state} />;
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="date" name="refundOn" required max={today} defaultValue={today} className={`${input} w-40`} />
      <input name="refundReference" required maxLength={100} placeholder="Refund reference" className={`${input} max-w-[12rem]`} />
      <Submit label="Record refund" tone="plain" />
      <Msg s={state} />
    </form>
  );
}

export function BankSettingsForm({ values }: { values: Record<string, string> }) {
  const [state, action] = useFormState(saveBankSettings, null);
  const f = (key: string, label: string, hint?: string) => (
    <label className="block text-sm font-medium text-card-foreground">
      {label}
      <input name={key} defaultValue={values[key] ?? ""} maxLength={200} placeholder={hint} className={`${input} mt-1`} />
    </label>
  );
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {f("bank_name", "Bank", "e.g. Republic Bank")}
        {f("branch", "Branch (optional)")}
        {f("account_name", "Account name")}
        {f("account_number", "Account number")}
        {f("reference_hint", "Reference students should use", "Your NRG email address")}
        {f("turnaround_days", "Working days to check a receipt", "2")}
      </div>
      <div className="flex items-center gap-3"><Submit label="Save bank details" /><Msg s={state} /></div>
    </form>
  );
}
