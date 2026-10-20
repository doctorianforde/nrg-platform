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
    <div className="mt-4 space-y-4 rounded-xl border border-brand-200/60 bg-brand-50/50 p-5 text-sm motion-safe:animate-rise-in">
      {explanation ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3ZM10 20h4"
              />
            </svg>
            Explanation
          </div>
          <p className="whitespace-pre-line leading-relaxed text-card-foreground">{explanation}</p>
        </div>
      ) : null}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          Option rationales
        </div>
        <OptionReviewList options={options} selectedIds={selectedIds} />
      </div>
    </div>
  );
}
