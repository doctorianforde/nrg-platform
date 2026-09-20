"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateDisplayName, type MessageState } from "@/lib/messages/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-brand-700 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
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
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground"
        />
      </label>
      {state && "error" in state ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state && "ok" in state ? (
        <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Saved — this is the name your teacher sees.
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
