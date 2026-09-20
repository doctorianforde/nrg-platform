"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createGroup, joinGroup, type GroupActionState } from "./group/actions";

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-50`}>
      {pending ? "…" : label}
    </button>
  );
}

/** Join someone else's group with the 6-character code they read out. */
export function JoinGroupForm() {
  const [state, action] = useFormState<GroupActionState, FormData>(joinGroup, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label htmlFor="join-code" className="sr-only">
        Group join code
      </label>
      <input
        id="join-code"
        name="code"
        maxLength={6}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="7QK2MP"
        className="w-32 rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm uppercase tracking-widest text-card-foreground placeholder:text-muted-foreground/60"
      />
      <Submit
        label="Join group"
        className="rounded-lg border-2 border-brand-700 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
      />
      {state?.error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Open a group on one particular paper and become its owner. */
export function CreateGroupForm({ setId }: { setId: string }) {
  const [state, action] = useFormState<GroupActionState, FormData>(createGroup, null);
  return (
    <form action={action}>
      <input type="hidden" name="set_id" value={setId} />
      <Submit
        label="Sit it with a group"
        className="w-full rounded-lg border-2 border-brand-700 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
      />
      {state?.error ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
