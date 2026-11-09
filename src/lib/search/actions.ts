"use server";

import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listReviews } from "@/lib/topic-reviews/queries";
import { flags } from "@/lib/flags";

export type SearchEntry = {
  kind: "page" | "review" | "domain";
  title: string;
  /** Shown under the title (body system, domain code…). */
  hint: string;
  href: string;
  /** Extra words that should match (review keywords, page synonyms). */
  terms: string[];
};

const PAGES: Array<SearchEntry & { rankingV2?: boolean }> = [
  { kind: "page", title: "Study dashboard", hint: "Home", href: "/study", terms: ["home", "lobby"] },
  { kind: "page", title: "My progress", hint: "Your analytics", href: "/study/analytics", terms: ["analytics", "progress", "weak", "strengths", "stamina", "stats"] },
  { kind: "page", title: "Practice questions", hint: "Tutor mode", href: "/study/practice", terms: ["practice", "questions", "quiz", "tutor"] },
  { kind: "page", title: "Topic reviews", hint: "Library", href: "/study/reviews", terms: ["reviews", "notes", "library", "read"] },
  { kind: "page", title: "Flashcards", hint: "Recall", href: "/study/flashcards", terms: ["cards", "recall"] },
  { kind: "page", title: "Case studies", hint: "Unfolding cases", href: "/study/case-studies", terms: ["case", "scenario"] },
  { kind: "page", title: "Mock exams", hint: "Exam format", href: "/study/mock-exams", terms: ["exam", "mock", "test"] },
  { kind: "page", title: "Promotion quiz", hint: "Rank up", href: "/study/promotion", terms: ["rank", "promotion", "level"], rankingV2: true },
  { kind: "page", title: "Trophies", hint: "Badges", href: "/study/trophies", terms: ["badges", "awards", "trophy"], rankingV2: true },
  { kind: "page", title: "Write a question", hint: "Earn XP", href: "/study/submit", terms: ["submit", "write", "author"] },
  { kind: "page", title: "Profile and settings", hint: "Theme, messages, calendar", href: "/study/profile", terms: ["profile", "settings", "theme", "messages", "calendar", "account"] },
];

/** What the student search (Ctrl+K) can find: study pages, published topic reviews, and practice by domain. */
export async function loadSearchIndex(): Promise<SearchEntry[]> {
  const session = await getSession();
  if (!session?.profile) return [];
  const [reviews, { data: domains }] = await Promise.all([
    listReviews().catch(() => []),
    createClient().from("domains").select("id, code, name").order("display_order"),
  ]);
  return [
    ...PAGES.filter((p) => !p.rankingV2 || flags.rankingV2).map((p) => ({ kind: p.kind, title: p.title, hint: p.hint, href: p.href, terms: p.terms })),
    ...reviews
      .filter((r) => r.status === "published")
      .map((r) => ({ kind: "review" as const, title: r.title, hint: `Topic review · ${r.system}`, href: `/study/reviews/${r.slug}`, terms: [r.system, ...r.keywords] })),
    ...(domains ?? []).map((d) => ({
      kind: "domain" as const,
      title: `Practise ${d.name}`,
      hint: `Domain ${d.code} · 10 questions`,
      href: `/study/practice/session?domain=${d.id}&count=10`,
      terms: [d.code, d.name],
    })),
  ];
}
