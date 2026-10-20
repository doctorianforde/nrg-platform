import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { optionTypeFor } from "@/lib/quiz/option-types";

const LETTERS = "ABCDEFGH";

export type ReviewOption = {
  id: string;
  body: string;
  is_correct?: boolean | null;
  rationale?: string | null;
  distractor_type?: string | null;
};

/**
 * The colour-coded rationale view (V3 s.11) for one question's options: each option with its type label and colour,
 * correct first, then close / priority / incorrect / not-asked, then any untyped options in their original order.
 * Letters stay those the student saw (`options` must be in display order). `selectedIds` marks the student's answer.
 *
 * Renders only what it is given: callers decide on the server whether keys and rationales may be shown at all.
 * No hooks, so it works in server and client trees alike.
 */
export function OptionReviewList({
  options,
  selectedIds,
  className,
}: {
  options: ReviewOption[];
  selectedIds?: readonly string[];
  className?: string;
}) {
  const ordered = options
    .map((o, i) => ({ o, i, t: optionTypeFor(o) }))
    .sort((a, b) => a.t.order - b.t.order || a.i - b.i);
  return (
    <ul className={cn("space-y-2", className)}>
      {ordered.map(({ o, i, t }) => {
        const mine = selectedIds?.includes(o.id) ?? false;
        return (
          <li key={o.id} className={cn("rounded-lg border border-l-4 px-3.5 py-2.5 text-sm shadow-sm", t.className)}>
            {t.label || mine ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {t.label ? <span className="text-xs font-semibold uppercase tracking-wide">{t.label}</span> : null}
                {mine ? <Badge tone="blue">Your answer</Badge> : null}
              </div>
            ) : null}
            <div className="font-medium">
              {LETTERS[i] ?? i + 1}. {o.body}
            </div>
            {o.rationale ? (
              <p className="mt-1 whitespace-pre-line leading-relaxed">{o.rationale.replace(/^CORRECT:\s*/i, "")}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
