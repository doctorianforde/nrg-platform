"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Stage } from "@/lib/case";
import type { ReferenceRange } from "@/lib/case/reference";
import { StageBlock } from "@/components/case/StageBlock";
import { Calculator } from "@/components/case/Calculator";
import { formatDuration } from "@/components/case/time";

const LETTERS = "ABCD";

type Props = {
  caseId: string;
  attemptId: string;
  action: (formData: FormData) => void | Promise<void>;
  /** Only the stages revealed so far; later stages never reach the browser. */
  slides: Stage[];
  /** Index (into slides) of the first slide revealed by the last answer; the player opens there. */
  firstNew: number;
  question: { id: string; position: number; body: string; options: { id: string; body: string }[] };
  total: number;
  isLast: boolean;
  ranges: ReferenceRange[];
  /** ISO timestamps from the database, plus the server's clock, so the timers survive reloads and ignore a wrong client clock. */
  startedAt: string;
  questionStartedAt: string;
  serverNow: string;
};

/**
 * The student case player: the case unfolds as a slide show. Students can step back through everything revealed so
 * far, but nothing past the current question exists on the page until the answer is locked in. The answer can only be
 * locked once the newest slide has been viewed, so new information can't be skipped.
 */
export function CaseRunner(p: Props) {
  const last = p.slides.length - 1;
  const [index, setIndex] = useState(Math.min(p.firstNew, last));
  const [seenLatest, setSeenLatest] = useState(Math.min(p.firstNew, last) === last);
  const [calcOpen, setCalcOpen] = useState(false);
  const now = useNow(p.serverNow);

  useEffect(() => { if (index === last) setSeenLatest(true); }, [index, last]);

  // Arrow keys move between slides (not while typing into the calculator or choosing with the keyboard).
  const calcRef = useRef(calcOpen); calcRef.current = calcOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (calcRef.current || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(last, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const slide = p.slides[index];
  const isNew = index >= p.firstNew && slide.stage_order > 0;
  const caseTime = formatDuration(now - Date.parse(p.startedAt));
  const qTime = formatDuration(now - Date.parse(p.questionStartedAt));

  return (
    <div className="space-y-4">
      {/* Top bar: progress, timers, calculator */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
        <span className="text-sm font-semibold text-card-foreground">Question {p.question.position} of {p.total}</span>
        <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${((p.question.position - 1) / p.total) * 100}%` }} />
        </div>
        <div className="flex items-center gap-3 font-mono text-sm tabular-nums text-card-foreground" aria-label="Timers">
          <span title="Time on this question" suppressHydrationWarning><span className="font-sans text-xs text-muted-foreground">Question </span>{qTime}</span>
          <span title="Total time on the case" suppressHydrationWarning><span className="font-sans text-xs text-muted-foreground">Case </span>{caseTime}</span>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setCalcOpen((o) => !o)} aria-expanded={calcOpen}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <CalcIcon /> Calculator
          </button>
          {calcOpen ? <div className="absolute right-0 top-full z-30 mt-2"><Calculator onClose={() => setCalcOpen(false)} /></div> : null}
        </div>
      </div>

      {/* Slide */}
      <div className="rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-40">← Previous</button>
          <div className="flex items-center gap-1.5" aria-label={`Slide ${index + 1} of ${p.slides.length} revealed`}>
            {p.slides.map((s, i) => (
              <button key={s.id} type="button" onClick={() => setIndex(i)} aria-label={`Go to ${s.time_label}`}
                className={`h-2.5 rounded-full transition-all ${i === index ? "w-6 bg-primary" : i >= p.firstNew && s.stage_order > 0 ? "w-2.5 bg-brand-400" : "w-2.5 bg-border hover:bg-muted-foreground"}`} />
            ))}
            {!p.isLast ? <span className="ml-1 text-xs text-muted-foreground" title="More of the case unlocks after you lock in your answer">🔒</span> : null}
          </div>
          <button type="button" onClick={() => setIndex((i) => Math.min(last, i + 1))} disabled={index === last}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-40">Next →</button>
        </div>
        {/* On larger screens the slide scrolls inside a fixed height so the question and ranges stay in view. */}
        <div className="rounded-xl lg:max-h-[46vh] lg:overflow-y-auto">
          <StageBlock key={slide.id} stage={slide} isOpening={slide.stage_order === 0} isLatest={isNew} showNewTag={isNew} />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {slide.time_label} · slide {index + 1} of {p.slides.length} so far{index < last ? " · use Next or → to return to the latest information" : ""}
        </p>
      </div>

      {/* Question (lower left) and reference ranges (lower right) */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form action={p.action} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <input type="hidden" name="caseId" value={p.caseId} />
          <input type="hidden" name="attemptId" value={p.attemptId} />
          <h2 className="font-heading text-base font-semibold text-card-foreground">Question {p.question.position}</h2>
          <p className="mt-2 text-base text-card-foreground">{p.question.body}</p>
          <div className="mt-4 space-y-2">
            {p.question.options.map((o, i) => (
              <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm hover:border-primary/50 hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-brand-50">
                <input type="radio" name="optionId" value={o.id} required className="mt-0.5" />
                <span className="font-semibold">{LETTERS[i]}.</span>
                <span>{o.body}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
            <span className="text-xs text-muted-foreground">
              {seenLatest ? "Your answer locks when you continue." : "View the new information first: use Next → to reach the latest slide."}
            </span>
            <LockButton disabled={!seenLatest} label={p.isLast ? "Lock in and finish" : "Lock in and continue"} />
          </div>
        </form>

        <aside className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-card-foreground">Reference ranges</h2>
          {p.ranges.length ? (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {p.ranges.map((r) => (
                  <tr key={r.name} className="border-t border-border first:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left align-top font-normal text-muted-foreground">{r.name}</th>
                    <td className="py-1.5 text-card-foreground">{r.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Ranges for laboratory results appear here as results are reported in the case.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Adult ranges; local laboratory ranges may differ slightly.</p>
        </aside>
      </div>
    </div>
  );
}

function LockButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={disabled || pending}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">
      {pending ? "Locking in…" : label}
    </button>
  );
}

/** Current time on the server's clock, ticking every second. */
function useNow(serverNow: string) {
  const [offset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

function CalcIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
    </svg>
  );
}
