"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteAccount, setRole, setSuspended, type AdminState } from "@/lib/admin/actions";

const BTN = "rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50";

function Submit({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${BTN} ${className}`}>
      {pending ? "Working…" : children}
    </button>
  );
}

function Feedback({ state }: { state: AdminState }) {
  if (state && "error" in state) {
    return (
      <p role="alert" className="mt-1 text-xs text-red-700">
        {state.error}
      </p>
    );
  }
  if (state && "ok" in state) return <p className="mt-1 text-xs text-green-700">{state.ok}</p>;
  return null;
}

/**
 * Per-account controls. Three levels, weakest first: change role (reversible),
 * suspend sign-in (reversible), delete (permanent, and typed-confirmation gated).
 * The server re-checks every one of these; nothing here is the real guard.
 */
export function AccountActions({
  userId,
  email,
  role,
  suspended,
  canManage,
  canMakeAdmin,
}: {
  userId: string;
  email: string;
  role: string;
  suspended: boolean;
  /** False for your own row and, unless you're a super admin, for other super admins. */
  canManage: boolean;
  canMakeAdmin: boolean;
}) {
  const [roleState, roleAction] = useFormState<AdminState, FormData>(setRole, null);
  const [suspendState, suspendAction] = useFormState<AdminState, FormData>(setSuspended, null);
  const [deleteState, deleteAction] = useFormState<AdminState, FormData>(deleteAccount, null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  if (!canManage) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const roles = ["student", "teacher", ...(canMakeAdmin ? ["admin"] : [])].filter((r) => r !== role);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {roles.map((r) => (
          <form key={r} action={roleAction}>
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="role" value={r} />
            <Submit className="border border-border bg-card text-card-foreground hover:bg-muted">
              Make {r.replace("_", " ")}
            </Submit>
          </form>
        ))}

        <form action={suspendAction}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="suspend" value={suspended ? "0" : "1"} />
          <Submit
            className={
              suspended
                ? "border border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
                : "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }
          >
            {suspended ? "Restore sign-in" : "Suspend sign-in"}
          </Submit>
        </form>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${BTN} border border-red-300 bg-red-50 text-red-800 hover:bg-red-100`}
          >
            Delete…
          </button>
        ) : null}
      </div>

      {confirming ? (
        <form action={deleteAction} className="rounded-lg border border-red-200 bg-red-50 p-2">
          <input type="hidden" name="user_id" value={userId} />
          <p className="text-xs text-red-900">
            This permanently deletes the account and their own history. Type{" "}
            <strong>{email}</strong> to confirm.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              className="rounded border border-red-300 bg-white px-2 py-1 text-xs"
            />
            <button
              type="submit"
              disabled={typed.trim().toLowerCase() !== email.toLowerCase()}
              className={`${BTN} bg-red-600 text-white hover:bg-red-700`}
            >
              Delete permanently
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              className={`${BTN} text-muted-foreground hover:text-card-foreground`}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <Feedback state={roleState} />
      <Feedback state={suspendState} />
      <Feedback state={deleteState} />
    </div>
  );
}
