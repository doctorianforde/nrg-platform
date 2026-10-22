"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ReviewQuestion } from "@/lib/topic-reviews/types";

/** The deck's own RENR practice question: pick an option, then see the answer, the rationale and why the others are wrong.
 *  Not part of the question bank, so it records nothing and pays no XP. */
export function ReviewQuestionCard({ question }: { question: ReviewQuestion }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const why = new Map(question.why.map((w) => [w.letter, w.html]));

  return (
    <div className="rounded-2xl border border-brand-100 bg-card p-5 shadow-sm">
      <div className="text-sm font-medium leading-relaxed text-card-foreground [&_p+p]:mt-1.5" dangerouslySetInnerHTML={{ __html: question.stem }} />
      <div className="mt-4 space-y-2">
        {question.options.map((o) => {
          const correct = o.letter === question.answer;
          const mine = picked === o.letter;
          return (
            <button
              key={o.letter}
              type="button"
              disabled={shown}
              onClick={() => setPicked(o.letter)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                !shown && (mine ? "border-primary bg-brand-50 ring-1 ring-primary" : "border-border hover:bg-muted"),
                shown && correct && "border-green-300 bg-green-50",
                shown && !correct && mine && "border-red-300 bg-red-50",
                shown && !correct && !mine && "border-border opacity-80"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  shown && correct ? "bg-green-600 text-white" : shown && mine ? "bg-red-600 text-white" : "bg-brand-100 text-brand-700"
                )}
              >
                {o.letter}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-card-foreground" dangerouslySetInnerHTML={{ __html: o.html }} />
                {shown && !correct && why.get(o.letter) ? (
                  <span className="mt-1 block text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: why.get(o.letter)! }} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {shown ? (
        <div className="mt-4 rounded-xl border border-brand-200/60 bg-brand-50/50 p-4 text-sm motion-safe:animate-rise-in">
          <p className="font-semibold text-card-foreground">
            {picked === question.answer ? "Correct — " : picked ? "Not quite — " : ""}the answer is {question.answer}.
          </p>
          <div className="mt-2 leading-relaxed text-card-foreground [&_p+p]:mt-1.5" dangerouslySetInnerHTML={{ __html: question.rationale }} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShown(true)}
          disabled={!picked}
          className={cn(
            "mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all",
            picked ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover" : "cursor-not-allowed bg-muted text-muted-foreground"
          )}
        >
          Check answer
        </button>
      )}
    </div>
  );
}
