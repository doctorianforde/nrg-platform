"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { FACTS, factAt } from "@/lib/knowledge/facts";

/**
 * Floating "Nursing Knowledge" card — one high-yield prompt at a time, tap to reveal.
 *
 * Facts live in `src/lib/knowledge/facts.ts` so the same list feeds the review PDF
 * (`npx tsx scripts/knowledge-facts-pdf.ts`) and can never drift from what students see.
 *
 * Motion: the card bounces in on mount and hops when the fact changes. Both are
 * `motion-safe:` only, so anyone who has asked their system to reduce motion gets the
 * content with no movement at all.
 */
export function KnowledgeWidget() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [open, setOpen] = useState(true);

  // Pick the starting fact after mount, not during render: a random initial value
  // would differ between the server and client passes and trip a hydration warning.
  useEffect(() => {
    setIndex(Math.floor(Math.random() * FACTS.length));
  }, []);

  const fact = factAt(index);
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-30 w-80 rounded-xl bg-gradient-to-br from-brand-700 to-brand-800 p-4 text-white shadow-2xl",
        "motion-safe:animate-bounce-in"
      )}
      role="complementary"
      aria-label="Nursing knowledge"
    >
      <div className="flex items-center justify-between">
        <span className="font-heading text-sm font-semibold">Nursing Knowledge</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-purple-200" aria-hidden>
            {(index % FACTS.length) + 1}/{FACTS.length}
          </span>
          <button
            type="button"
            aria-label="Close nursing knowledge card"
            onClick={() => setOpen(false)}
            className="rounded px-1.5 text-purple-200 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Keyed on the fact so React remounts it — that is what re-fires the hop. */}
      <div key={index} className="motion-safe:animate-bounce-nudge">
        <div className="mt-2">
          <Badge tone="green">{fact.category}</Badge>
        </div>
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-expanded={flipped}
          className={cn(
            "mt-3 block w-full rounded-lg bg-white/10 p-3 text-left text-sm transition-colors hover:bg-white/15",
            flipped && "text-purple-100"
          )}
        >
          {flipped ? fact.back : fact.front}
          <span className="mt-1 block text-xs text-purple-200">
            {flipped ? "Tap to flip back" : "Tap to reveal"}
          </span>
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setIndex((i) => i - 1);
            setFlipped(false);
          }}
          className="text-purple-200 hover:text-white"
        >
          ‹ Previous
        </button>
        <button
          type="button"
          onClick={() => {
            setIndex((i) => i + 1);
            setFlipped(false);
          }}
          className="font-medium text-white hover:underline"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
