import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { OptionReviewList } from "@/components/questions/OptionReviewList";
import { CJ_LABEL, TAXONOMY_LABEL, type CaseQuestion } from "@/lib/case";

const LETTERS = "ABCD";

/**
 * Answer/instructor view of one case question (V3 s.11): key, then each option with its colour class
 * and text label (correct first), the rationale, and the classification. `selectedId` marks the student's answer.
 */
export function CaseQuestionReview({ q, selectedId, showMeta = true }: { q: CaseQuestion; selectedId?: string | null; showMeta?: boolean }) {
  const key = q.options.find((o) => o.is_correct);
  const keyLetter = key ? LETTERS[q.options.indexOf(key)] : "?";
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
      <OptionReviewList className="mt-3" options={q.options} selectedIds={selectedId ? [selectedId] : undefined} />
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
