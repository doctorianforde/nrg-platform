"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createThread, type MessageState } from "@/lib/messages/actions";
import type { CitedAttempt } from "@/lib/messages/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send to your teacher"}
    </button>
  );
}

const input =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground";

export function NewThreadForm({
  attempts,
  preselectedSessionId,
}: {
  attempts: CitedAttempt[];
  /** Set when arriving from a results page, so the attempt is already attached. */
  preselectedSessionId?: string;
}) {
  const [state, action] = useFormState<MessageState, FormData>(createThread, null);

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Subject</span>
        <input
          name="subject"
          required
          maxLength={200}
          placeholder="e.g. Pacing on long papers"
          className={input}
        />
      </label>

      {attempts.length > 0 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">
            Attach a mock exam result <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <select name="session_id" defaultValue={preselectedSessionId ?? ""} className={input}>
            <option value="">No attempt attached</option>
            {attempts.map((a) => (
              <option key={a.sessionId} value={a.sessionId}>
                {a.title}
                {a.scorePct != null ? ` — ${Math.round(a.scorePct)}%` : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Attaching a result lets your teacher see the scores you&apos;re asking about.
          </span>
        </label>
      ) : (
        <input type="hidden" name="session_id" value="" />
      )}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Your question</span>
        <textarea
          name="body"
          rows={5}
          required
          maxLength={4000}
          placeholder="What would you like feedback on?"
          className={input}
        />
      </label>

      {state && "error" in state ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
