import { OptionReviewList, type ReviewOption } from "@/components/questions/OptionReviewList";

/** Post-answer feedback: explanation + the colour-coded option rationales (V3 s.11, correct first). Tutor mode and a
 *  released mock review only — never render during a mock exam before rationale release. `options` in display order. */
export function RationalePanel({
  explanation,
  options,
  selectedIds,
}: {
  explanation: string | null;
  options: ReviewOption[];
  selectedIds?: readonly string[];
}) {
  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-muted p-4 text-sm">
      {explanation ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Explanation
          </div>
          <p className="whitespace-pre-line text-card-foreground">{explanation}</p>
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Option rationales
        </div>
        <OptionReviewList options={options} selectedIds={selectedIds} />
      </div>
    </div>
  );
}
