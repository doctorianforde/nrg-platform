import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { CJ_LABEL, OPTION_TYPE, TAXONOMY_LABEL, type CaseQuestion } from "@/lib/case";
import { cn } from "@/lib/cn";

const LETTERS = "ABCD";

/**
 * Answer/instructor view of one case question (V3 s.11): key, then each option with its colour class
 * and text label (correct first), the rationale, and the classification. `selectedId` marks the student's answer.
 */
export function CaseQuestionReview({ q, selectedId, showMeta = true }: { q: CaseQuestion; selectedId?: string | null; showMeta?: boolean }) {
  const key = q.options.find((o) => o.is_correct);
  const keyLetter = key ? LETTERS[q.options.indexOf(key)] : "?";
  const ordered = [...q.options].sort(
    (a, b) => (OPTION_TYPE[a.distractor_type ?? "incorrect"]?.order ?? 9) - (OPTION_TYPE[b.distractor_type ?? "incorrect"]?.order ?? 9)
  );
  const answeredRight = selectedId != null && key?.id === selectedId;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="text-base">Question {q.position}</CardTitle>
        {selectedId !== undefined ? (
          <Badge tone={answeredRight ? "green" : "red"}>{answeredRight ? "You answered correctly" : "Not the best answer"}</Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-card-foreground">{q.body}</p>
      <p className="mt-3 text-sm font-semibold text-card-foreground">
        Answer: {keyLetter}. {key?.body}
      </p>
      <ul className="mt-3 space-y-2">
        {ordered.map((o) => {
          const t = OPTION_TYPE[o.distractor_type ?? (o.is_correct ? "correct" : "incorrect")] ?? OPTION_TYPE.incorrect;
          const letter = LETTERS[q.options.indexOf(o)];
          return (
            <li key={o.id} className={cn("rounded-md border-l-4 px-3 py-2 text-sm", t.className)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide">{t.label}</span>
                {o.id === selectedId ? <Badge tone="blue">Your answer</Badge> : null}
              </div>
              <div className="mt-1 font-medium">{letter}. {o.body}</div>
              {o.rationale ? <p className="mt-1 whitespace-pre-line opacity-90">{o.rationale.replace(/^CORRECT:\s*/i, "")}</p> : null}
            </li>
          );
        })}
      </ul>
      {showMeta ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="purple">{CJ_LABEL[q.cj_step] ?? q.cj_step}</Badge>
          {q.meta.domain ? <Badge tone="gray">Domain: {q.meta.domain}</Badge> : null}
          {q.meta.taxonomy ? <Badge tone="gray">{TAXONOMY_LABEL[q.meta.taxonomy] ?? q.meta.taxonomy}</Badge> : null}
          {q.meta.topic ? <Badge tone="gray">{q.meta.topic}{q.meta.subtopic ? ` · ${q.meta.subtopic}` : ""}</Badge> : null}
        </div>
      ) : null}
      {showMeta && q.meta.suggested_review ? (
        <p className="mt-2 text-xs text-muted-foreground">Suggested review: {q.meta.suggested_review}</p>
      ) : null}
    </Card>
  );
}
