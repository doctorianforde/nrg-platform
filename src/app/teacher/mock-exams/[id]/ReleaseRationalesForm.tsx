"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { releaseRationales, type ManageSetState } from "./actions";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Releasing…" : "Yes, release rationales"}
    </button>
  );
}

/**
 * Two-step deliberate release. There is intentionally no un-release path:
 * re-locking requires an admin (DB trigger), so teachers see a released set
 * as "Released (ask an admin to re-lock)".
 */
export function ReleaseRationalesForm({ setId }: { setId: string }) {
  const [state, action] = useFormState<ManageSetState, FormData>(releaseRationales, null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-800"
      >
        Release rationales
      </button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="set_id" value={setId} />
      <p className="text-sm text-card-foreground">
        Release explanations and option rationales to every student who takes this exam?
        This is a one-way action — only an admin can re-lock them.
      </p>
      <div className="flex items-center gap-3">
        <ConfirmButton />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-sm text-muted-foreground underline"
        >
          Cancel
        </button>
      </div>
      {state?.error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
