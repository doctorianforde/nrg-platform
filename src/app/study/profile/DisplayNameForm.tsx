"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateDisplayName, type MessageState } from "@/lib/messages/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [state, action] = useFormState<MessageState, FormData>(updateDisplayName, null);

  return (
    <form action={action}>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Display name</span>
        <input
          name="full_name"
          defaultValue={currentName}
          required
          maxLength={120}
          placeholder="Your name"
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>
      {state && "error" in state ? (
        <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state && "ok" in state ? (
        <p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 motion-safe:animate-fade-in">
          Saved — this is the name your teacher sees.
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
