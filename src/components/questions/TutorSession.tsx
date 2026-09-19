"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { QuizQuestion } from "@/lib/quiz/types";
import { OptionRow, type OptionState } from "@/components/questions/OptionRow";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { RationalePanel } from "@/components/questions/RationalePanel";
import { Badge } from "@/components/ui/Badge";

function playSound(kind: "correct" | "wrong") {
  try {
    const audio = new Audio(`/sounds/${kind}-answer.mp3`);
    void audio.play().catch(() => {});
  } catch {
    // Audio is a nicety, never block the flow on it.
  }
}

/**
 * Tutor-mode question runner: answer → immediate feedback with explanation and
 * rationales. Used by practice sessions and case studies. NOT for mock exams
 * (those give no feedback until submission).
 */
export function TutorSession({
  questions,
  title = "Practice session",
  intro,
  backHref = "/study/practice",
  backLabel = "Back to practice setup",
}: {
  questions: QuizQuestion[];
  title?: string;
  intro?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);
  const played = useRef(false);

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No questions matched these filters.{" "}
        <Link href={backHref} className="text-primary underline">
          Adjust your selection
        </Link>
        .
      </div>
    );
  }

  if (finished) {
    const total = tally.correct + tally.wrong;
    const pct = total === 0 ? 0 : Math.round((tally.correct / total) * 100);
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <h2 className="font-heading text-2xl font-bold">Session complete</h2>
        <p className="mt-4 font-heading text-5xl font-bold text-primary">{pct}%</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {tally.correct} of {total} correct
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIndex(0);
              setSelected([]);
              setRevealed(false);
              setTally({ correct: 0, wrong: 0 });
              setFinished(false);
              played.current = false;
            }}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800"
          >
            Restart
          </button>
          <Link
            href={backHref}
            className="rounded-md border border-border px-5 py-2 text-sm font-medium text-card-foreground hover:bg-muted"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const isSata = q.question_type === "sata";
  const correctIds = q.options.filter((o) => o.is_correct).map((o) => o.id);
  const isCorrect =
    selected.length > 0 &&
    selected.length === correctIds.length &&
    correctIds.every((id) => selected.includes(id));

  const toggle = (id: string) => {
    if (revealed) return;
    setSelected((prev) =>
      isSata
        ? prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id]
        : [id]
    );
  };

  const reveal = () => {
    if (selected.length === 0 || revealed) return;
    setRevealed(true);
    playSound(isCorrect ? "correct" : "wrong");
    played.current = true;
  };

  const next = () => {
    if (!played.current) playSound(isCorrect ? "correct" : "wrong");
    setTally((t) => (isCorrect ? { ...t, correct: t.correct + 1 } : { ...t, wrong: t.wrong + 1 }));
    if (index + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIndex(index + 1);
      setSelected([]);
      setRevealed(false);
      played.current = false;
    }
  };

  const optionState = (optionId: string): OptionState => {
    if (!revealed) return selected.includes(optionId) ? "selected" : "idle";
    const opt = q.options.find((o) => o.id === optionId);
    if (opt?.is_correct) return selected.includes(optionId) ? "correct" : "missed";
    if (selected.includes(optionId)) return "wrong";
    return "dimmed";
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {title} · Question {index + 1} of {questions.length}
        </span>
        {revealed ? (
          <Badge tone={isCorrect ? "green" : "red"}>{isCorrect ? "Correct" : "Incorrect"}</Badge>
        ) : null}
      </div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${((index + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <QuestionMetaBadges meta={q} />
        {intro && index === 0 ? (
          <p className="mt-4 whitespace-pre-line rounded-md bg-muted p-4 text-sm text-card-foreground">
            {intro}
          </p>
        ) : null}
        <p className="mt-4 whitespace-pre-line text-base font-medium text-card-foreground">
          {q.body}
        </p>

        <div className="mt-4 space-y-2">
          {q.options.map((o, i) => (
            <OptionRow
              key={o.id}
              index={i}
              body={o.body}
              state={optionState(o.id)}
              disabled={revealed}
              onClick={() => toggle(o.id)}
            />
          ))}
        </div>

        {revealed ? <RationalePanel explanation={q.explanation} options={q.options} /> : null}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {isSata ? "Select all that apply, then check." : "Pick one answer, then check."}
          </span>
          {revealed ? (
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800"
            >
              {index + 1 >= questions.length ? "Finish" : "Next question"}
            </button>
          ) : (
            <button
              type="button"
              onClick={reveal}
              disabled={selected.length === 0}
              className={cn(
                "rounded-md px-5 py-2 text-sm font-medium",
                selected.length === 0
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-brand-800"
              )}
            >
              Check answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
