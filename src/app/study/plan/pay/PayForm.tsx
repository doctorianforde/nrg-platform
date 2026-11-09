"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { submitMembershipRequest } from "@/lib/membership/actions";
import type { Plan } from "@/lib/membership/queries";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const ttd = (n: number) => `TT$${n.toLocaleString("en-TT")}`;

/** The payment form. The receipt goes straight from the browser into the student's own folder of the private bucket
 *  (the bucket only accepts JPEG, PNG or PDF under 5 MB, once); then the request is created on the server. */
export function PayForm({ userId, plans, initialPlan, today }: { userId: string; plans: Plan[]; initialPlan?: string; today: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState(plans.some((p) => p.code === initialPlan) ? initialPlan! : plans[plans.length - 1]?.code ?? "");
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Choose the receipt to upload.");
    if (!TYPES[file.type]) return setError("The receipt must be a JPEG, PNG or PDF.");
    if (file.size > MAX_BYTES) return setError("The receipt must be under 5 MB.");
    setBusy(true);
    const path = `${userId}/${crypto.randomUUID()}.${TYPES[file.type]}`;
    const { error: upErr } = await createClient().storage.from("payment-receipts").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setBusy(false);
      return setError("The receipt didn't upload. Check your connection and try again.");
    }
    const res = await submitMembershipRequest({ plan, paidOn, method, reference, receiptPath: path });
    if (res?.error) {
      setBusy(false);
      return setError(res.error);
    }
    router.push("/study/plan");
    router.refresh();
  }

  const field = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <fieldset>
        <legend className="text-sm font-medium text-card-foreground">Plan</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {plans.map((p) => (
            <label key={p.code} className={cn("flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm", plan === p.code ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted")}>
              <span className="flex items-center gap-2">
                <input type="radio" name="plan" value={p.code} checked={plan === p.code} onChange={() => setPlan(p.code)} className="accent-[hsl(var(--primary))]" />
                <span className="font-medium text-card-foreground">{p.name}</span>
              </span>
              <span className="font-semibold tabular-nums text-card-foreground">{ttd(p.priceTtd)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-card-foreground">
          Date you paid
          <input type="date" required max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={field} />
        </label>
        <label className="block text-sm font-medium text-card-foreground">
          How you paid
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="online_banking">Online banking</option>
            <option value="cash_deposit">Cash deposit at the bank</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-card-foreground">
        Payment reference or confirmation number
        <input required minLength={2} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="As it appears on your receipt" className={field} />
      </label>
      <label className="block text-sm font-medium text-card-foreground">
        Receipt (JPEG, PNG or PDF, under 5 MB)
        <input type="file" required accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm text-card-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium" />
      </label>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60">
        {busy ? "Sending…" : "Send for checking"}
      </button>
    </form>
  );
}
