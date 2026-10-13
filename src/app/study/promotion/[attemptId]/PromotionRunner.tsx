"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PromotionState } from "@/lib/xp/rank-v2";
import { answerPromotion, refreshPromotion } from "../actions";

const LETTERS = "ABCDEF";

/**
 * One question at a time with its own 90-second countdown. The countdown is only a display: the server times each
 * question from when it was first shown and scores it wrong once the time (plus a few seconds' grace) has passed.
 * When the display reaches zero the runner asks the server for the next state, retrying briefly through the grace.
 */
export function PromotionRunner({ attemptId, initial, targetName }: { attemptId: string; initial: PromotionState; targetName: string }) {
  const [state, setState] = useState<PromotionState>(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(() => Date.now() + (initial.done ? 0 : initial.seconds_left * 1000));
  const [now, setNow] = useState(() => Date.now());
  const refreshing = useRef(false);
  const current = useRef(state);
  current.current = state;

  const accept = useCallback((next: PromotionState | { error: string }) => {
    if ("error" in next) { setError(next.error); return; }
    setError(null);
    const prev = current.current;
    if (!next.done && !prev.done && next.position === prev.position) return; // still inside the server's grace
    setNotice(next.timed_out ? "Time ran out on that question, so it was counted as wrong." : null);
    setSelected([]);
    if (!next.done) setDeadline(Date.now() + next.seconds_left * 1000);
    setState(next);
  }, []);

  useEffect(() => {
    if (state.done) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state.done]);

  const left = state.done ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));

  // Out of time: ask the server to move on; it may still be within its grace, so try again shortly until it does.
  useEffect(() => {
    if (state.done || left > 0 || busy || refreshing.current) return;
    refreshing.current = true;
    const pos = state.position;
    let stop = false;
    const tick = async () => {
      const next = await refreshPromotion(attemptId);
      if (stop) return;
      if (!("error" in next) && !next.done && next.position === pos) { setTimeout(tick, 2000); return; }
      refreshing.current = false;
      accept(next && !("error" in next) ? { ...next, timed_out: true } : next);
    };
    void tick();
    return () => { stop = true; refreshing.current = false; };
  }, [left, state, busy, attemptId, accept]);

  if (state.done) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Promotion quiz complete</p>
        <p className="mt-4 font-heading text-5xl font-bold text-primary">{state.score} / {state.total}</p>
        {state.passed ? (
          <>
            <p className="mt-3 text-lg font-semibold text-green-800">Passed. You are now {targetName}.</p>
            <p className="mt-1 text-sm text-muted-foreground">Keep earning XP to unlock the next promotion quiz.</p>
          </>
        ) : (
          <>
            <p className="mt-3 text-lg font-semibold text-card-foreground">Not this time: {state.pass_mark} correct were needed.</p>
            <p className="mt-1 text-sm text-muted-foreground">You can try again after 24 hours with a fresh set of questions. Your XP is safe.</p>
          </>
        )}
        <Link href="/study/profile" className="mt-6 inline-block rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800">
          Back to your rank
        </Link>
      </div>
    );
  }

  const q = state.question;
  const sata = q.question_type === "sata";
  const low = left <= 15;
  const toggle = (id: string) => setSelected((s) => (sata ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  const submit = async () => {
    if (!selected.length || busy || left === 0) return;
    setBusy(true);
    const next = await answerPromotion(attemptId, state.position, selected);
    setBusy(false);
    accept(next);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
        <span className="text-sm font-semibold text-card-foreground">Question {state.position} of {state.total}</span>
        <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${((state.position - 1) / state.total) * 100}%` }} />
        </div>
        <span className={`font-mono text-lg font-semibold tabular-nums ${low ? "text-red-700" : "text-card-foreground"}`} aria-live="polite" aria-label={`${left} seconds left`}>
          0:{String(left).padStart(2, "0")}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full transition-[width] duration-300 ${low ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${(left / 90) * 100}%` }} />
      </div>

      {notice ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p> : null}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-base text-card-foreground">{q.body}</p>
        <div className="mt-4 space-y-2" role={sata ? "group" : "radiogroup"}>
          {q.options.map((o, i) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm hover:border-primary/50 hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-brand-50">
              <input type={sata ? "checkbox" : "radio"} name="option" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} disabled={left === 0} className="mt-0.5" />
              <span className="font-semibold">{LETTERS[i]}.</span>
              <span>{o.body}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {left === 0 ? "Time's up, moving on…" : sata ? "Select all that apply. You can't come back to this question." : "You can't come back to this question."}
          </span>
          <button type="button" onClick={submit} disabled={!selected.length || busy || left === 0}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Saving…" : state.position === state.total ? "Submit and finish" : "Submit answer"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
