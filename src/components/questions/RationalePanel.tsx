import { Badge } from "@/components/ui/Badge";

export type RationaleOption = {
  id: string;
  body: string;
  is_correct: boolean;
  rationale: string | null;
};

/** Post-answer feedback: explanation + per-option rationales. Tutor mode only —
 *  never render during a mock exam before rationale release. */
export function RationalePanel({
  explanation,
  options,
}: {
  explanation: string | null;
  options: RationaleOption[];
}) {
  const rationales = options.filter((o) => o.rationale);
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
      {rationales.length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Option rationales
          </div>
          <ul className="space-y-1.5">
            {rationales.map((o) => (
              <li key={o.id} className="flex gap-2">
                <Badge tone={o.is_correct ? "green" : "gray"}>
                  {o.is_correct ? "Correct" : "Incorrect"}
                </Badge>
                <span className="whitespace-pre-line text-muted-foreground">{o.rationale}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!explanation && rationales.length === 0 ? (
        <p className="text-muted-foreground">No explanation available for this question.</p>
      ) : null}
    </div>
  );
}
