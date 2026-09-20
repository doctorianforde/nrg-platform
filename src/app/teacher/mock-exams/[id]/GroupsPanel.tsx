"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { assignGroup, setDuration, startAssignedGroup, type ManageSetState } from "./actions";

export type StudentOption = { id: string; name: string };
export type GroupRow = {
  id: string;
  name: string | null;
  status: string;
  joinCode: string;
  members: Array<{
    studentId: string;
    name: string;
    scorePct: number | null;
    correct: number | null;
    total: number | null;
    completed: boolean;
  }>;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-card-foreground";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function GroupsPanel({
  setId,
  durationMinutes,
  students,
  groups,
}: {
  setId: string;
  durationMinutes: number | null;
  students: StudentOption[];
  groups: GroupRow[];
}) {
  const [durState, durAction] = useFormState<ManageSetState, FormData>(setDuration, null);
  const [assignState, assignAction] = useFormState<ManageSetState, FormData>(assignGroup, null);
  const [startState, startAction] = useFormState<ManageSetState, FormData>(
    startAssignedGroup,
    null
  );
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));

  return (
    <div className="space-y-5">
      {/* ── time limit ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-brand-100 bg-card p-5">
        <h3 className="font-heading text-base font-semibold text-card-foreground">Time limit</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Applies to every attempt at this paper, solo or group. Leave blank for no limit.
        </p>
        <form action={durAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="set_id" value={setId} />
          <input
            name="duration_minutes"
            type="number"
            min={5}
            max={600}
            defaultValue={durationMinutes ?? ""}
            placeholder="Minutes"
            className={cn(inputCls, "w-40")}
          />
          <Submit label="Save" />
          {durationMinutes ? (
            <span className="text-sm text-muted-foreground">
              Currently {durationMinutes} minutes
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Currently untimed</span>
          )}
        </form>
        {durState?.error ? (
          <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {durState.error}
          </p>
        ) : null}
      </section>

      {/* ── assign a group ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-brand-100 bg-card p-5">
        <h3 className="font-heading text-base font-semibold text-card-foreground">
          Set a group exam
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick 2 to 5 students. They each sit the same paper and answer for themselves — you
          start the clock for all of them together.
        </p>

        <form action={assignAction} className="mt-3 space-y-3">
          <input type="hidden" name="set_id" value={setId} />
          {picked.map((id) => (
            <input key={id} type="hidden" name="student_ids" value={id} />
          ))}
          <input name="name" maxLength={120} placeholder="Group name (optional)" className={inputCls} />

          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {students.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No students yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {students.map((s) => {
                  const on = picked.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                          on && "bg-brand-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-card-foreground">{s.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Submit label="Create group" />
            <span className="text-sm text-muted-foreground">{picked.length} of 5 picked</span>
          </div>
        </form>
        {assignState?.error ? (
          <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {assignState.error}
          </p>
        ) : null}
      </section>

      {/* ── existing groups and their results ────────────────────────────── */}
      <section className="rounded-xl border border-brand-100 bg-card p-5">
        <h3 className="font-heading text-base font-semibold text-card-foreground">
          Groups on this paper
        </h3>
        {startState?.error ? (
          <p role="alert" className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
            {startState.error}
          </p>
        ) : null}

        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No groups yet — students can also make their own with a join code.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {groups.map((g) => {
              const done = g.members.filter((m) => m.completed && m.scorePct !== null);
              const avg =
                done.length > 0
                  ? Math.round(done.reduce((n, m) => n + (m.scorePct ?? 0), 0) / done.length)
                  : null;
              return (
                <li key={g.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        g.status === "finished"
                          ? "green"
                          : g.status === "running"
                            ? "blue"
                            : g.status === "cancelled"
                              ? "gray"
                              : "amber"
                      }
                    >
                      {g.status === "lobby" ? "Waiting" : g.status}
                    </Badge>
                    <span className="text-sm font-medium text-card-foreground">
                      {g.name || "Group exam"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {g.members.length} student{g.members.length === 1 ? "" : "s"}
                    </span>
                    {g.status === "lobby" ? (
                      <span className="font-mono text-xs tracking-widest text-muted-foreground">
                        {g.joinCode}
                      </span>
                    ) : null}
                    {avg !== null ? (
                      <span className="text-xs text-muted-foreground">· average {avg}%</span>
                    ) : null}
                    {g.status === "lobby" && g.members.length >= 2 ? (
                      <form action={startAction} className="ml-auto">
                        <input type="hidden" name="set_id" value={setId} />
                        <input type="hidden" name="group_id" value={g.id} />
                        <Submit label="Start now" />
                      </form>
                    ) : null}
                  </div>

                  <ul className="mt-2 space-y-1">
                    {[...g.members]
                      .sort((a, b) => (b.scorePct ?? -1) - (a.scorePct ?? -1))
                      .map((m) => (
                        <li
                          key={m.studentId}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <span className="text-card-foreground">{m.name}</span>
                          <span className="ml-auto">
                            {m.completed && m.scorePct !== null ? (
                              <>
                                <strong className="text-card-foreground">
                                  {Math.round(m.scorePct)}%
                                </strong>
                                {m.total ? (
                                  <span className="ml-1 text-xs">
                                    {m.correct}/{m.total}
                                  </span>
                                ) : null}
                              </>
                            ) : g.status === "lobby" ? (
                              <span className="text-xs">not started</span>
                            ) : (
                              <span className="text-xs">still sitting…</span>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
