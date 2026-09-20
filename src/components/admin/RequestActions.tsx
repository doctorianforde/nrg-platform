"use client";

import { useFormState, useFormStatus } from "react-dom";
import { decideRequest, type AdminState } from "@/lib/admin/actions";

function Button({
  decision,
  className,
  children,
}: {
  decision: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      name="decision"
      value={decision}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function RequestActions({ requestId }: { requestId: string }) {
  const [state, action] = useFormState<AdminState, FormData>(decideRequest, null);

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="request_id" value={requestId} />
      <input
        name="note"
        maxLength={500}
        placeholder="Optional note (kept on the record)"
        className="w-full rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-card-foreground"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button decision="approve" className="bg-green-600 text-white hover:bg-green-700">
          Approve teacher access
        </Button>
        <Button decision="deny" className="border border-border bg-card text-card-foreground hover:bg-muted">
          Deny
        </Button>
        {state && "error" in state ? (
          <span role="alert" className="text-sm text-red-700">
            {state.error}
          </span>
        ) : null}
        {state && "ok" in state ? <span className="text-sm text-green-700">{state.ok}</span> : null}
      </div>
    </form>
  );
}
