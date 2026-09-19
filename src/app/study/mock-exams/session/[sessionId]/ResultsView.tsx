import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { OptionRow, type OptionState } from "@/components/questions/OptionRow";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { RationalePanel } from "@/components/questions/RationalePanel";
import type { QuizQuestion } from "@/lib/quiz/types";
import { fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";

type ResponseRow = {
  question_id: string;
  selected_option_ids: string[];
  is_correct: boolean | null;
};

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className} aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * Post-exam results. Correctness is only shown AFTER submission — never during
 * the exam. Explanations and option rationales render exclusively when the
 * teacher has released them (set.rationale_released_at); the review list and
 * the rationale data are otherwise fully separated.
 */
export function ResultsView({
  setTitle,
  session,
  questions,
  responses,
  rationaleReleased,
}: {
  setTitle: string;
  session: {
    score_pct: number | null;
    total_questions: number | null;
    correct_count: number | null;
    completed_at: string | null;
    started_at: string;
  };
  questions: QuizQuestion[];
  responses: ResponseRow[];
  rationaleReleased: boolean;
}) {
  const byQuestion = new Map(responses.map((r) => [r.question_id, r]));
  const total = session.total_questions ?? questions.length;

  return (
    <div className="space-y-5">
      {/* Score hero */}
      <div className="rounded-2xl border border-brand-100 bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your score — {setTitle}
        </p>
        <p className="mt-2 font-heading text-6xl font-bold text-brand-700">
          {fmtPct(session.score_pct)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {session.correct_count ?? 0} of {total} correct · completed{" "}
          {fmtDateTime(session.completed_at)}
        </p>
      </div>

      {!rationaleReleased ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <LockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Rationales are locked</p>
            <p className="text-sm text-amber-800">
              Your teacher will release explanations and option rationales after class review.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-900">Rationales released</p>
            <p className="text-sm text-green-800">
              Your teacher has released the explanations and option rationales for this exam.
            </p>
          </div>
        </div>
      )}

      <Card className="rounded-xl border-brand-100">
        <h2 className="font-heading font-semibold text-card-foreground">Question review</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Questions with no recorded answer are shown as unanswered.
        </p>
        <ul className="mt-4 space-y-4">
          {questions.map((q, qi) => {
            const response = byQuestion.get(q.id);
            const selected = new Set(response?.selected_option_ids ?? []);
            const unanswered = !response || response.selected_option_ids.length === 0;
            return (
              <li
                key={q.id}
                className="rounded-xl border border-border bg-card p-4 first:border-t sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {qi + 1}
                  </span>
                  {unanswered ? (
                    <Badge tone="amber">Unanswered</Badge>
                  ) : response?.is_correct ? (
                    <Badge tone="green">Correct</Badge>
                  ) : (
                    <Badge tone="red">Incorrect</Badge>
                  )}
                  <span className="ml-auto">
                    <QuestionMetaBadges meta={q} />
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-card-foreground">
                  {q.body}
                </p>
                <div className="mt-3 space-y-2">
                  {q.options.map((o, i) => {
                    const wasSelected = selected.has(o.id);
                    const state: OptionState = o.is_correct
                      ? wasSelected
                        ? "correct"
                        : "missed"
                      : wasSelected
                        ? "wrong"
                        : "dimmed";
                    return (
                      <OptionRow
                        key={o.id}
                        index={i}
                        body={o.body}
                        state={state}
                        disabled
                        marker={
                          o.is_correct ? (
                            <Badge tone="green">Correct answer</Badge>
                          ) : wasSelected ? (
                            <Badge tone="red">Your answer</Badge>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
                {rationaleReleased ? (
                  <RationalePanel explanation={q.explanation} options={q.options} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Link
        href="/study/mock-exams"
        className="inline-block rounded-lg border-2 border-brand-700 px-5 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
      >
        ‹ Back to mock exams
      </Link>
    </div>
  );
}
