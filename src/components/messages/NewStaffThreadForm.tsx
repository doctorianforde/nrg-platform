"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createThreadForStudent, type MessageState } from "@/lib/messages/actions";
import type { RosterStudent } from "@/lib/messages/queries";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground";

export function NewStaffThreadForm({ students }: { students: RosterStudent[] }) {
  const [state, action] = useFormState<MessageState, FormData>(createThreadForStudent, null);
  const [open, setOpen] = useState(false);

  if (students.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No students have signed up yet, so there&apos;s nobody to write to.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border-2 border-brand-700 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        Start a conversation
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Student</span>
        <select name="student_id" required defaultValue="" className={input}>
          <option value="" disabled>
            Choose a student…
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Subject</span>
        <input name="subject" required maxLength={200} placeholder="e.g. Feedback on your last paper" className={input} />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Message</span>
        <textarea name="body" rows={5} required maxLength={4000} placeholder="Your feedback…" className={input} />
      </label>

      {state && "error" in state ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-card-foreground"
        >
          Cancel
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}
