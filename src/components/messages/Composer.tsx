"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { postReply, type MessageState } from "@/lib/messages/actions";

function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

export function Composer({
  threadId,
  placeholder,
  label = "Send",
}: {
  threadId: string;
  placeholder: string;
  label?: string;
}) {
  const [state, action] = useFormState<MessageState, FormData>(postReply, null);
  const formRef = useRef<HTMLFormElement>(null);

  // useFormState hands back a fresh object per submit, so this fires each time.
  useEffect(() => {
    if (state && "ok" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-4">
      <input type="hidden" name="thread_id" value={threadId} />
      <label htmlFor={`body-${threadId}`} className="sr-only">
        Your message
      </label>
      <textarea
        id={`body-${threadId}`}
        name="body"
        rows={4}
        maxLength={4000}
        required
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground"
      />
      {state && "error" in state ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <SendButton label={label} />
      </div>
    </form>
  );
}
