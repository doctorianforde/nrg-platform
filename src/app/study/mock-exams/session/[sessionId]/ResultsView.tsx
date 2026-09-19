import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
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
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Score" value={fmtPct(session.score_pct)} />
        <StatCard
          label="Correct"
          value={`${session.correct_count ?? 0} / ${total}`}
        />
        <StatCard label="Completed" value={fmtDateTime(session.completed_at)} />
      </div>

      {!rationaleReleased ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Rationales are locked. Your teacher will release them after class review.
        </p>
      ) : (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your teacher has released the rationales for this exam.
        </p>
      )}

      <Card>
        <h2 className="font-heading font-semibold text-card-foreground">
          Review — {setTitle}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Questions with no recorded answer are shown as unanswered.
        </p>
        <ul className="mt-4 space-y-6">
          {questions.map((q, qi) => {
            const response = byQuestion.get(q.id);
            const selected = new Set(response?.selected_option_ids ?? []);
            const unanswered = !response || response.selected_option_ids.length === 0;
            return (
              <li key={q.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-card-foreground">
                    Question {qi + 1}
                  </span>
                  {unanswered ? (
                    <Badge tone="amber">Unanswered</Badge>
                  ) : response?.is_correct ? (
                    <Badge tone="green">Correct</Badge>
                  ) : (
                    <Badge tone="red">Incorrect</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <QuestionMetaBadges meta={q} />
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-card-foreground">
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
        className="inline-block rounded-md border border-border bg-card px-5 py-2 text-sm font-medium text-card-foreground hover:bg-muted"
      >
        ← Back to mock exams
      </Link>
    </div>
  );
}
