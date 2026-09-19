"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";

const FACTS = [
  {
    category: "Vital Signs",
    front: "Normal adult vitals you must know",
    back: "T 36.5–37.5°C · P 60–100 bpm · R 12–20/min · BP <120/80 · SpO₂ ≥95%",
  },
  {
    category: "Lab Values",
    front: "Serum potassium — the classic RENR value",
    back: "3.5–5.0 mmol/L. Below 3.5 → hypokalemia: watch for flattened T waves and weakness.",
  },
  {
    category: "Mnemonics",
    front: "MONA — acute chest pain orders",
    back: "Morphine · Oxygen · Nitrates · Aspirin. Pain relief first, then re-assess.",
  },
  {
    category: "Safety",
    front: "The 5 Rights of medication administration",
    back: "Right patient · Right drug · Right dose · Right route · Right time. Always two identifiers.",
  },
] as const;

/** Floating "Nursing Knowledge" widget from the reference home page. */
export function KnowledgeWidget() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [open, setOpen] = useState(true);
  const fact = FACTS[index % FACTS.length];

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 w-80 rounded-xl bg-gradient-to-br from-brand-700 to-brand-800 p-4 text-white shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="font-heading text-sm font-semibold">Nursing Knowledge</span>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="rounded px-1.5 text-purple-200 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mt-2">
        <Badge tone="green">{fact.category}</Badge>
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          "mt-3 block w-full rounded-lg bg-white/10 p-3 text-left text-sm transition-colors hover:bg-white/15",
          flipped && "text-purple-100"
        )}
      >
        {flipped ? fact.back : fact.front}
        <span className="mt-1 block text-xs text-purple-200">
          {flipped ? "Click to flip back" : "Click to reveal"}
        </span>
      </button>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-purple-200">Learn more</span>
        <button
          type="button"
          onClick={() => {
            setIndex((i) => (i + 1) % FACTS.length);
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
