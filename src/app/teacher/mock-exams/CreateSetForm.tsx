"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createSet, type CreateSetState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create exam set"}
    </button>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground";

export function CreateSetForm() {
  const [state, action] = useFormState<CreateSetState, FormData>(createSet, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="set-title" className="mb-1 block text-sm font-medium text-card-foreground">
          Title
        </label>
        <input id="set-title" name="title" required maxLength={200} className={inputCls} placeholder="e.g. Med-Surg Midterm Mock" />
      </div>
      <div>
        <label htmlFor="set-desc" className="mb-1 block text-sm font-medium text-card-foreground">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea id="set-desc" name="description" rows={2} className={inputCls} placeholder="What this mock exam covers" />
      </div>
      <div>
        <label htmlFor="set-duration" className="mb-1 block text-sm font-medium text-card-foreground">
          Time limit <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="set-duration"
          name="duration_minutes"
          type="number"
          min={5}
          max={600}
          className={inputCls}
          placeholder="Minutes — leave blank for no time limit"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          A timed set counts down for solo attempts too. In a group exam the clock starts for
          everyone at the same moment.
        </p>
      </div>
      {state?.error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
