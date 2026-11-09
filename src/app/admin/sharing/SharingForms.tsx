"use client";

import { useFormState, useFormStatus } from "react-dom";
import { markSharingReviewed, saveSharingThresholds, type SharingActionState } from "./actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

const Message = ({ state }: { state: SharingActionState }) =>
  state?.error ? <p className="text-xs text-red-700">{state.error}</p> : state?.ok ? <p className="text-xs text-green-700">{state.ok}</p> : null;

export function ThresholdsForm({ bumps, devices }: { bumps: number; devices: number }) {
  const [state, action] = useFormState(saveSharingThresholds, null);
  const field = "w-20 rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm tabular-nums text-card-foreground";
  return (
    <form action={action} className="flex flex-wrap items-end gap-4">
      <label className="text-sm text-card-foreground">
        <span className="block text-xs text-muted-foreground">Sign-outs in one day</span>
        <input name="bumps_per_day" type="number" min={1} max={100} step={1} defaultValue={bumps} className={field} />
      </label>
      <label className="text-sm text-card-foreground">
        <span className="block text-xs text-muted-foreground">Different browsers in 7 days</span>
        <input name="devices_per_week" type="number" min={1} max={100} step={1} defaultValue={devices} className={field} />
      </label>
      <Submit>Save thresholds</Submit>
      <Message state={state} />
    </form>
  );
}

export function ReviewForm({ userId }: { userId: string }) {
  const [state, action] = useFormState(markSharingReviewed, null);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="note"
        maxLength={500}
        placeholder="Note (optional): e.g. new phone, spoke to student"
        className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-card-foreground placeholder:text-muted-foreground"
      />
      <Submit>Mark reviewed</Submit>
      <Message state={state} />
    </form>
  );
}
