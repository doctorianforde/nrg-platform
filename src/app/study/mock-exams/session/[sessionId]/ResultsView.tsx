import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { OptionRow, type OptionState } from "@/components/questions/OptionRow";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { RationalePanel } from "@/components/questions/RationalePanel";
import type { QuizQuestion } from "@/lib/quiz/types";
import { fmtDateTime, fmtPct } from "@/lib/mock-exam/utils";
import { buildFatigueReport } from "@/lib/mock-exam/fatigue";
import { FatigueAnalysis } from "@/components/mock-exam/FatigueAnalysis";
import { reviewForQuestion, type ReviewLink } from "@/lib/topic-reviews/catalog";

type ResponseRow = {
  question_id: string;
  selected_option_ids: string[];
  is_correct: boolean | null;
  answered_at?: string | null;
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

/** Decorative score ring: a muted track with a brand-gradient arc for the score share. */
function ScoreRing({ pct }: { pct: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 -rotate-90" aria-hidden>
      <defs>
        <linearGradient id="score-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgb(var(--brand-400))" />
          <stop offset="100%" stopColor="rgb(var(--brand-600))" />
        </linearGradient>
      </defs>
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        stroke="url(#score-ring-grad)"
        strokeDasharray={`${(share / 100) * c} ${c}`}
      />
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
  groupStillSitting = false,
  reviewLinks = [],
}: {
  setTitle: string;
  session: {
    id: string;
    score_pct: number | null;
    total_questions: number | null;
    correct_count: number | null;
    completed_at: string | null;
    started_at: string;
  };
  questions: QuizQuestion[];
  responses: ResponseRow[];
  rationaleReleased: boolean;
  /** Published topic reviews, so each released question can link to its review. */
  reviewLinks?: ReviewLink[];
  /**
   * True while a group-mate is still answering this same paper. The per-question
   * review names the correct option, so showing it to whoever finishes first
   * hands them the answers to read out to the people still sitting the exam.
   */
  groupStillSitting?: boolean;
}) {
  const byQuestion = new Map(responses.map((r) => [r.question_id, r]));
  const total = session.total_questions ?? questions.length;
  // `questions` is already in the order the student sat them (preserveOrder).
  const fatigue = buildFatigueReport(
    questions.map((q) => q.id),
    responses,
    session.started_at
  );

  return (
    <div className="space-y-5">
      {/* Score hero */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-card p-8 text-center shadow-sm motion-safe:animate-rise-in">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-400 opacity-70"
        />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your score — {setTitle}
        </p>
        <div className="relative mx-auto mt-4 h-36 w-36">
          <ScoreRing pct={session.score_pct ?? 0} />
          <p className="absolute inset-0 flex items-center justify-center font-heading text-3xl font-bold tabular-nums text-brand-700">
            {fmtPct(session.score_pct)}
          </p>
        </div>
        <p className="mt-4 text-sm tabular-nums text-muted-foreground">
          {session.correct_count ?? 0} of {total} correct · completed{" "}
          {fmtDateTime(session.completed_at)}
        </p>
      </div>

      {!rationaleReleased ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-200/70">
            <LockIcon className="h-4 w-4 text-amber-700" />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-900">Rationales are locked</p>
            <p className="text-sm text-amber-800">
              Your teacher will release explanations and option rationales after class review.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 ring-1 ring-green-200/70">
            <CheckIcon className="h-4 w-4 text-green-700" />
          </span>
          <div>
            <p className="text-sm font-semibold text-green-900">Rationales released</p>
            <p className="text-sm text-green-800">
              Your teacher has released the explanations and option rationales for this exam.
            </p>
          </div>
        </div>
      )}

      {fatigue ? <FatigueAnalysis report={fatigue} /> : null}

      {groupStillSitting ? (
        <Card className="rounded-xl border-amber-200 bg-amber-50/60">
          <h2 className="font-heading font-semibold text-amber-900">
            Question review opens when everyone has finished
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Your score is above. The question-by-question review names the correct option, so it
            stays shut until the rest of your group has handed in — otherwise finishing first
            would mean holding their answers.
          </p>
        </Card>
      ) : (
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
                {rationaleReleased ? (
                  // Released: the colour-coded review (correct first, typed options labelled) replaces the plain rows.
                  <RationalePanel
                    explanation={q.explanation ?? null}
                    options={q.options}
                    selectedIds={response?.selected_option_ids ?? []}
                    review={reviewForQuestion(q, reviewLinks)}
                  />
                ) : (
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
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/study/mock-exams"
          className="inline-block rounded-lg border border-border bg-card px-5 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          ‹ Back to mock exams
        </Link>
        <Link
          href={`/study/profile?attach=${session.id}`}
          className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md"
        >
          Ask your teacher about this attempt
        </Link>
      </div>
    </div>
  );
}
