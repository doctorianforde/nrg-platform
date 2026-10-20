"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { leaveGroup, startGroup, type GroupActionState } from "../actions";

export type LobbyMember = {
  studentId: string;
  name: string;
  isOwner: boolean;
  invited: boolean;
  isYou: boolean;
};

/**
 * Refreshes the server component every few seconds so members appear as they
 * join and everyone is pulled into the exam when the owner starts.
 *
 * Deliberately polling rather than Supabase Realtime: a five-person lobby asking
 * once every three seconds is nothing, and it avoids adding a websocket
 * dependency (and a second set of authorization rules) for a screen people look
 * at for about a minute. Worth revisiting if lobbies ever feel laggy.
 */
const POLL_MS = 3000;

function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(className, "disabled:opacity-50")}>
      {pending ? "Working…" : children}
    </button>
  );
}

export function LobbyView({
  groupId,
  setTitle,
  groupName,
  joinCode,
  members,
  maxMembers,
  canStart,
  durationMinutes,
  questionCount,
}: {
  groupId: string;
  setTitle: string;
  groupName: string | null;
  joinCode: string;
  members: LobbyMember[];
  maxMembers: number;
  canStart: boolean;
  durationMinutes: number | null;
  questionCount: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [startState, startAction] = useFormState<GroupActionState, FormData>(startGroup, null);
  const [leaveState, leaveAction] = useFormState<GroupActionState, FormData>(leaveGroup, null);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code is on screen to read out anyway.
      setCopied(false);
    }
  };

  const empty = maxMembers - members.length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-card p-6 shadow-sm motion-safe:animate-rise-in">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400 opacity-70"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-semibold text-card-foreground">
              {groupName || "Group exam"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {setTitle} · {questionCount} question{questionCount === 1 ? "" : "s"}
              {durationMinutes ? ` · ${durationMinutes} minutes` : " · untimed"}
            </p>
          </div>
          <Badge dot tone="amber">Waiting to start</Badge>
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-brand-200 bg-brand-50/60 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Share this code
          </p>
          <p className="mt-1 inline-block rounded-lg bg-card px-4 py-1.5 font-mono text-3xl font-bold tracking-[0.3em] text-brand-800 shadow-sm ring-1 ring-brand-200/70">
            {joinCode}
          </p>
          <div>
            <button
              type="button"
              onClick={copy}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100/60"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-100 bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-card-foreground">
          In this group — {members.length} of {maxMembers}
        </h3>
        <ul className="mt-3 space-y-2">
          {members.map((m) => (
            <li
              key={m.studentId}
              className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-2 text-sm shadow-sm motion-safe:animate-fade-in"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-semibold text-brand-800 ring-1 ring-brand-200/60">
                {m.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="font-medium text-card-foreground">{m.name}</span>
              {m.isYou ? <Badge tone="blue">You</Badge> : null}
              {m.isOwner ? <Badge tone="purple">Owner</Badge> : null}
            </li>
          ))}
          {Array.from({ length: Math.max(0, empty) }).map((_, i) => (
            <li
              key={`empty-${i}`}
              className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
            >
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground/50">·</span>
              Empty seat
            </li>
          ))}
        </ul>

        {members.length < 2 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            At least one more person needs to join before the exam can start.
          </p>
        ) : null}
      </section>

      {startState?.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {startState.error}
        </p>
      ) : null}
      {leaveState?.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {leaveState.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {canStart ? (
          <form action={startAction}>
            <input type="hidden" name="group_id" value={groupId} />
            <SubmitButton
              className={cn(
                "rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md",
                members.length < 2 && "pointer-events-none opacity-50"
              )}
            >
              Start for everyone
            </SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for the group owner to start the exam…
          </p>
        )}

        <form action={leaveAction}>
          <input type="hidden" name="group_id" value={groupId} />
          <SubmitButton className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:border-brand-300 hover:bg-muted">
            Leave group
          </SubmitButton>
        </form>

        <Link
          href="/study/mock-exams"
          className="ml-auto text-sm text-muted-foreground underline hover:text-brand-700"
        >
          Back to mock exams
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Everyone answers for themselves — you each get your own score, and your own XP.
        {durationMinutes
          ? " The timer starts for all of you at the same moment."
          : ""}
      </p>
    </div>
  );
}
