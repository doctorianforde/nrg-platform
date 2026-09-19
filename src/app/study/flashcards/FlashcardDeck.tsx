"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export type DeckTopic = { id: number; name: string; count: number };

export type DeckFlashcard = {
  id: string;
  front: string;
  back: string;
  topicId: number | null;
  topicName: string | null;
  createdAt: string;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function FlashcardDeck({
  topics,
  cards,
}: {
  topics: DeckTopic[];
  cards: DeckFlashcard[];
}) {
  const [topicId, setTopicId] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState<DeckFlashcard[] | null>(null);

  const deck = useMemo(() => {
    const filtered = topicId === null ? cards : cards.filter((c) => c.topicId === topicId);
    return [...filtered].sort((a, b) => {
      const ta = a.topicId ?? -1;
      const tb = b.topicId ?? -1;
      if (ta !== tb) return ta - tb;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [cards, topicId]);

  const ordered = shuffled ?? deck;
  const card = ordered[index] ?? null;

  const pickTopic = (id: number | null) => {
    setTopicId(id);
    setIndex(0);
    setFlipped(false);
    setShuffled(null);
  };

  const goTo = (next: number) => {
    setFlipped(false);
    setIndex(Math.max(0, Math.min(ordered.length - 1, next)));
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Select topic
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pickTopic(null)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            topicId === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-card-foreground hover:border-brand-300 hover:bg-brand-50"
          )}
        >
          All topics ({cards.length})
        </button>
        {topics.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickTopic(t.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              topicId === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground hover:border-brand-300 hover:bg-brand-50"
            )}
          >
            {t.name} ({t.count})
          </button>
        ))}
      </div>

      {ordered.length === 0 || !card ? (
        <div className="mt-6">
          <EmptyState
            title="No flashcards for this topic yet"
            body="Check back soon — new flashcards are added as the question bank grows."
          />
        </div>
      ) : (
        <div className="mx-auto mt-6 max-w-2xl">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-heading font-semibold text-card-foreground">
              {index + 1} <span className="font-normal text-muted-foreground">/ {ordered.length}</span>
            </span>
            {card.topicName ? <Badge tone="purple">{card.topicName}</Badge> : null}
          </div>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-pressed={flipped}
            aria-label={flipped ? "Show front of card" : "Show back of card"}
            className="block h-64 w-full cursor-pointer [perspective:1200px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-72"
          >
            <div
              className={cn(
                "relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]",
                flipped && "[transform:rotateY(180deg)]"
              )}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-purple-100 bg-card p-8 text-center shadow-sm [backface-visibility:hidden]">
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                  Front
                </span>
                <p className="mt-3 whitespace-pre-line text-lg font-medium text-card-foreground">
                  {card.front}
                </p>
                <span className="mt-4 text-xs text-muted-foreground">Click to flip</span>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-brand-200 bg-brand-50 p-8 text-center shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="text-xs font-semibold uppercase tracking-widest text-brand-700">
                  Back
                </span>
                <p className="mt-3 whitespace-pre-line text-lg text-card-foreground">{card.back}</p>
              </div>
            </div>
          </button>

          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium",
                index === 0
                  ? "cursor-not-allowed border-border text-muted-foreground"
                  : "border-border bg-card text-card-foreground hover:border-brand-300 hover:bg-brand-50"
              )}
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800"
            >
              Flip
            </button>
            <button
              type="button"
              onClick={() => {
                setShuffled(shuffle(deck));
                setIndex(0);
                setFlipped(false);
              }}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:border-brand-300 hover:bg-brand-50"
            >
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              disabled={index >= ordered.length - 1}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium",
                index >= ordered.length - 1
                  ? "cursor-not-allowed border-border text-muted-foreground"
                  : "border-border bg-card text-card-foreground hover:border-brand-300 hover:bg-brand-50"
              )}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
