import Link from "next/link";
import { OptionReviewList, type ReviewOption } from "@/components/questions/OptionReviewList";

/** Post-answer feedback: explanation + the colour-coded option rationales (V3 s.11, correct first). Tutor mode and a
 *  released mock review only — never render during a mock exam before rationale release. `options` in display order.
 *  `review` is the topic review this question belongs to (cross-link, Template 16), when there is one. */
export function RationalePanel({
  explanation,
  options,
  selectedIds,
  review,
}: {
  explanation: string | null;
  options: ReviewOption[];
  selectedIds?: readonly string[];
  review?: { slug: string; title: string } | null;
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
      {review ? (
        <Link
          href={`/study/reviews/${review.slug}`}
          prefetch={false}
          className="flex items-center gap-2 rounded-lg border border-brand-200 bg-card px-3 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" />
          </svg>
          <span className="min-w-0 flex-1">Review this topic: {review.title}</span>
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}
