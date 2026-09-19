"use client";

import { useFormState, useFormStatus } from "react-dom";
import { startSession, type MockExamActionState } from "./actions";

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Starting…" : "Start exam"}
    </button>
  );
}

export function StartExamForm({ setId }: { setId: string }) {
  const [state, action] = useFormState<MockExamActionState, FormData>(startSession, null);
  return (
    <form action={action} className="mt-4 flex items-center gap-3">
      <input type="hidden" name="set_id" value={setId} />
      <StartButton />
      {state?.error ? (
        <span role="alert" className="text-sm text-red-700">{state.error}</span>
      ) : null}
    </form>
  );
}
