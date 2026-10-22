/**
 * A topic review as stored in topic_reviews.slides (written by scripts/import-topic-reviews.ts from Jade's slide decks).
 * Pure types, shared by the importer and the reader. HTML fields are sanitised at import: only p, ul, li, strong, em, br
 * and span.tr-warn / span.tr-good survive.
 */

export type ReviewBlock =
  | { type: "panel"; heading: string | null; html: string; tone: "plain" | "warn" | "good" }
  | { type: "table"; heading: string | null; header: string[]; rows: string[][] }
  | { type: "flow"; items: string[] }
  | { type: "callout"; html: string };

/** One column of a row: its share of the slide width (0–1) and its blocks, top to bottom. */
export type ReviewColumn = { width: number; blocks: ReviewBlock[] };

export type ReviewSlide = {
  /** anp | dysfunction | patho | signs | assessment | management | careplan | renr (the question slide is separate). */
  kind: string;
  title: string;
  subtitle: string | null;
  rows: ReviewColumn[][];
};

export type ReviewQuestion = {
  stem: string;
  options: { letter: string; html: string }[];
  answer: string;
  rationale: string;
  /** Why each wrong option is wrong, when the slide gives it. */
  why: { letter: string; html: string }[];
};

export type TopicReviewDoc = {
  slug: string;
  title: string;
  system: string;
  slides: ReviewSlide[];
  question: ReviewQuestion | null;
  /** Deck file it came from, for re-imports. */
  source: string;
};
