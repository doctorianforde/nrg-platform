"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { QuizQuestion } from "@/lib/quiz/types";
import { OptionRow, type OptionState } from "@/components/questions/OptionRow";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { RationalePanel } from "@/components/questions/RationalePanel";
import { Badge } from "@/components/ui/Badge";
import { revealPracticeAnswer, type RevealedAnswer } from "@/lib/quiz/actions";
import { reviewForQuestion, type ReviewLink } from "@/lib/topic-reviews/catalog";

/** One answered question as sent to the server, which grades it against the key. */
export type PracticeAnswer = { question_id: string; option_ids: string[] };

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
  onComplete,
  reviewLinks,
}: {
  questions: QuizQuestion[];
  title?: string;
  intro?: string;
  backHref?: string;
  backLabel?: string;
  /** Called once when a run finishes, so practice can be recorded and XP awarded. `answers` holds what was chosen
   *  for each question, for the server to grade (ranking v2). Case studies leave it unset and record nothing. */
  onComplete?: (total: number, correct: number, answers: PracticeAnswer[]) => void | Promise<void>;
  /** Published topic reviews; after "Check answer" the question links to the one it belongs to. */
  reviewLinks?: ReviewLink[];
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);
  const played = useRef(false);
  const reported = useRef(false);
  const answers = useRef<PracticeAnswer[]>([]);
  // The key arrives from the server only after "Check answer"; the browser never holds it beforehand.
  const [key, setKey] = useState<RevealedAnswer | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Report once per run. The tally is state, so this waits for it to settle rather
  // than firing inside the click handler with a stale count.
  useEffect(() => {
    if (!finished || reported.current || !onComplete) return;
    const total = tally.correct + tally.wrong;
    if (total === 0) return;
    reported.current = true;
    // After the run is recorded, ask the badge player to check for anything this session earned.
    void Promise.resolve(onComplete(total, tally.correct, answers.current)).then(() => window.dispatchEvent(new Event("nrg:badges-check")));
  }, [finished, tally, onComplete]);

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
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
      <div className="mx-auto max-w-xl overflow-hidden rounded-xl border border-border/80 bg-card p-8 text-center shadow-sm motion-safe:animate-rise-in">
        <h2 className="font-heading text-2xl font-bold text-card-foreground">Session complete</h2>
        <p className="mt-4 font-heading text-5xl font-bold tabular-nums text-primary motion-safe:animate-bounce-in">{pct}%</p>
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
              setKey(null);
              answers.current = [];
              reported.current = false;
              played.current = false;
            }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
          >
            Restart
          </button>
          <Link
            href={backHref}
            className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-card-foreground transition-colors hover:border-brand-300 hover:bg-muted"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const isSata = q.question_type === "sata";
  const correctIds = key?.correctIds ?? [];
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

  const reveal = async () => {
    if (selected.length === 0 || revealed || checking) return;
    setChecking(true);
    setCheckError(null);
    const r = await revealPracticeAnswer(q.id);
    setChecking(false);
    if ("error" in r) {
      setCheckError(r.error);
      return;
    }
    const right = selected.length === r.correctIds.length && r.correctIds.every((id) => selected.includes(id));
    setKey(r);
    setRevealed(true);
    playSound(right ? "correct" : "wrong");
    played.current = true;
  };

  const next = () => {
    if (!played.current) playSound(isCorrect ? "correct" : "wrong");
    setTally((t) => (isCorrect ? { ...t, correct: t.correct + 1 } : { ...t, wrong: t.wrong + 1 }));
    answers.current = [...answers.current.filter((a) => a.question_id !== q.id), { question_id: q.id, option_ids: selected }];
    if (index + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIndex(index + 1);
      setSelected([]);
      setRevealed(false);
      setKey(null);
      played.current = false;
    }
  };

  const optionState = (optionId: string): OptionState => {
    if (!revealed) return selected.includes(optionId) ? "selected" : "idle";
    if (correctIds.includes(optionId)) return selected.includes(optionId) ? "correct" : "missed";
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
          <Badge
            tone={isCorrect ? "green" : "red"}
            dot
            className="motion-safe:animate-bounce-nudge"
          >
            {isCorrect ? "Correct" : "Incorrect"}
          </Badge>
        ) : null}
      </div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-300"
          style={{ width: `${((index + (revealed ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
        <QuestionMetaBadges meta={q} />
        {intro && index === 0 ? (
          <p className="mt-4 whitespace-pre-line rounded-lg bg-muted p-4 text-sm leading-relaxed text-card-foreground">
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

        {revealed && key ? (
          <RationalePanel
            explanation={key.explanation}
            options={q.options.map((o) => ({
              ...o,
              is_correct: correctIds.includes(o.id),
              rationale: key.rationales[o.id] ?? null,
              distractor_type: key.types?.[o.id] ?? null,
            }))}
            selectedIds={selected}
            review={reviewLinks?.length ? reviewForQuestion(q, reviewLinks) : null}
          />
        ) : null}
        {checkError ? <p className="mt-3 text-sm text-red-700">{checkError}</p> : null}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {isSata ? "Select all that apply, then check." : "Pick one answer, then check."}
          </span>
          {revealed ? (
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
            >
              {index + 1 >= questions.length ? "Finish" : "Next question"}
            </button>
          ) : (
            <button
              type="button"
              onClick={reveal}
              disabled={selected.length === 0 || checking}
              className={cn(
                "rounded-lg px-5 py-2.5 text-sm font-semibold transition-all",
                selected.length === 0 || checking
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md"
              )}
            >
              {checking ? "Checking…" : "Check answer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
