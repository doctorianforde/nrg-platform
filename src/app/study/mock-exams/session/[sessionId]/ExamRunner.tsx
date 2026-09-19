"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { OptionRow } from "@/components/questions/OptionRow";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { saveResponse, submitSession } from "./actions";

/**
 * The exam runner receives ONLY sanitized questions: no is_correct flags, no
 * option rationales, no explanations. There is no feedback of any kind while
 * answering (real exam format), and OptionRow is limited to idle/selected.
 */
export type ExamQuestion = {
  id: string;
  body: string;
  question_type: string;
  cognitive_level: string | null;
  difficulty: string | null;
  options: Array<{ id: string; body: string; display_order: number }>;
};

const SAVE_DEBOUNCE_MS = 600;

export function ExamRunner({
  sessionId,
  setTitle,
  questions,
  initialAnswers,
}: {
  sessionId: string;
  setTitle: string;
  questions: ExamQuestion[];
  initialAnswers: Record<string, string[]>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(initialAnswers);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const latestAnswers = useRef(answers);
  latestAnswers.current = answers;

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        This exam has no questions yet.{" "}
        <Link href="/study/mock-exams" className="text-primary underline">
          Back to mock exams
        </Link>
        .
      </div>
    );
  }

  const q = questions[index];
  const isSata = q.question_type === "sata";
  const selected = answers[q.id] ?? [];
  const answeredCount = questions.filter((x) => (answers[x.id] ?? []).length > 0).length;

  const persist = (questionId: string, optionIds: string[]) => {
    const existing = timers.current.get(questionId);
    if (existing) clearTimeout(existing);
    setSaveState("saving");
    setSaveError(null);
    timers.current.set(
      questionId,
      setTimeout(() => {
        void saveResponse(sessionId, questionId, optionIds).then((result) => {
          if (result?.error) {
            setSaveState("error");
            setSaveError(result.error);
          } else if (latestAnswers.current[questionId] === optionIds) {
            setSaveState("saved");
          }
        });
      }, SAVE_DEBOUNCE_MS)
    );
  };

  const toggle = (optionId: string) => {
    const next = isSata
      ? selected.includes(optionId)
        ? selected.filter((x) => x !== optionId)
        : [...selected, optionId]
      : [optionId];
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    persist(q.id, next);
  };

  const submit = () => {
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitSession(sessionId);
      if (result?.error) setSubmitError(result.error);
      // On success the server action redirects back to this page, which then
      // renders the results view.
    });
  };

  return (
    <div>
      {/* Slim sticky exam bar with a thin purple progress line at its top edge. */}
      <div className="sticky top-16 z-10 -mx-4 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div
          className="absolute left-0 top-0 h-0.5 bg-brand-700 transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
          <Link
            href="/study/mock-exams"
            className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-brand-700"
          >
            ‹ Exit
          </Link>
          <span className="truncate text-sm font-semibold text-card-foreground">{setTitle}</span>
          <span className="ml-auto shrink-0 text-sm text-muted-foreground">
            <strong className="text-card-foreground">
              Question {index + 1} of {questions.length}
            </strong>
            <span className="hidden sm:inline">
              {" "}
              · {answeredCount} answered
              {saveState === "saving" ? " · saving…" : saveState === "saved" ? " · saved" : ""}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_16rem]">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <section className="rounded-2xl border border-brand-100 bg-card p-6 shadow-sm md:p-8">
            <QuestionMetaBadges meta={q} />
            <p className="mt-3 whitespace-pre-line text-base font-medium leading-relaxed text-card-foreground md:text-lg">
              <span className="mr-1 font-semibold text-brand-700">{index + 1}.</span>
              {q.body}
            </p>
            <div className="mt-5 space-y-2">
              {q.options.map((o, i) => (
                <OptionRow
                  key={o.id}
                  index={i}
                  body={o.body}
                  state={selected.includes(o.id) ? "selected" : "idle"}
                  onClick={() => toggle(o.id)}
                />
              ))}
            </div>
            {saveError ? (
              <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
                {saveError}
              </p>
            ) : null}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="rounded-lg border-2 border-brand-700 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-40"
              >
                ‹ Previous
              </button>
              <button
                type="button"
                disabled={index === questions.length - 1}
                onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-800 disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-brand-100 bg-card p-5 shadow-sm">
            {!confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-lg border-2 border-brand-700 px-5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                >
                  Submit exam
                </button>
                <p className="text-xs text-muted-foreground">
                  You can&apos;t change answers after submitting. Unanswered questions count as wrong.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-card-foreground">
                  Submit {setTitle} now? You answered {answeredCount} of {questions.length} questions.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={submit}
                    className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-800 disabled:opacity-50"
                  >
                    {pending ? "Submitting…" : "Yes, submit my exam"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-border bg-card px-5 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    Keep working
                  </button>
                </div>
              </div>
            )}
            {submitError ? (
              <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
                {submitError}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-brand-100 bg-card p-4 shadow-sm lg:sticky lg:top-36">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Question navigator
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {questions.map((x, i) => {
              const answered = (answers[x.id] ?? []).length > 0;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Question ${i + 1}${answered ? " (answered)" : " (unanswered)"}`}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg border text-xs font-medium transition-colors",
                    i === index
                      ? "border-primary bg-primary text-primary-foreground"
                      : answered
                        ? "border-brand-300 bg-brand-50 text-brand-800"
                        : "border-border bg-card text-muted-foreground hover:border-brand-300"
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>Selected answers save automatically.</p>
            <p>No feedback is shown during a mock exam — that&apos;s intentional.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
