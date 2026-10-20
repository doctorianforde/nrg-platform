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
        "fixed bottom-4 right-4 z-30 w-80 overflow-hidden rounded-2xl bg-gradient-to-br from-header-via to-header-from text-header-foreground shadow-xl ring-1 ring-white/15",
        "motion-safe:animate-bounce-in"
      )}
      role="complementary"
      aria-label="Nursing knowledge"
    >
      {/* Gradient header strip */}
      <div className="relative border-b border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-transparent px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-heading text-sm font-semibold tracking-tight">
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15 text-[11px] text-gold"
            >
              ✦
            </span>
            Nursing Knowledge
          </span>
          <div className="flex items-center gap-2">
            <span
              className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-header-muted"
              aria-hidden
            >
              {(index % FACTS.length) + 1}/{FACTS.length}
            </span>
            <button
              type="button"
              aria-label="Close nursing knowledge card"
              onClick={() => setOpen(false)}
              className="rounded-md px-1.5 py-0.5 text-header-muted transition-colors hover:bg-white/10 hover:text-header-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 pt-3">
        {/* Keyed on the fact so React remounts it — that is what re-fires the hop. */}
        <div key={index} className="motion-safe:animate-bounce-nudge">
          <div className="mt-0.5">
            <Badge tone="green">{fact.category}</Badge>
          </div>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-expanded={flipped}
            className={cn(
              "mt-3 block w-full rounded-xl bg-white/10 p-3.5 text-left text-sm leading-relaxed ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/15 hover:ring-white/20",
              flipped && "text-header-muted"
            )}
          >
            {flipped ? fact.back : fact.front}
            <span className="mt-1.5 block text-xs font-medium uppercase tracking-wide text-header-muted/80">
              {flipped ? "Tap to flip back" : "Tap to reveal"}
            </span>
          </button>
        </div>

        <div className="mt-3.5 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setIndex((i) => i - 1);
              setFlipped(false);
            }}
            className="rounded-md px-2 py-1 font-medium text-header-muted transition-colors hover:bg-white/10 hover:text-header-foreground"
          >
            ‹ Previous
          </button>
          <button
            type="button"
            onClick={() => {
              setIndex((i) => i + 1);
              setFlipped(false);
            }}
            className="rounded-md px-2 py-1 font-semibold text-header-foreground transition-colors hover:bg-white/10"
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
