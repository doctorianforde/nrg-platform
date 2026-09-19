import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { FlashcardDeck, type DeckFlashcard, type DeckTopic } from "./FlashcardDeck";

export const dynamic = "force-dynamic";

type FlashcardRow = {
  id: string;
  front: string;
  back: string;
  topic_id: number | null;
  created_at: string;
  topics: { name: string } | { name: string }[] | null;
};

export default async function FlashcardsPage() {
  const { user, profile } = await requireRole("student", "/study/flashcards");
  const supabase = createClient();

  const [{ data: flashcardRows }, { data: topicRows }] = await Promise.all([
    supabase
      .from("flashcards")
      .select("id, front, back, topic_id, created_at, topics(name)")
      .eq("is_active", true)
      .order("created_at"),
    supabase.from("topics").select("id, name").eq("is_active", true).order("name"),
  ]);

  const cards: DeckFlashcard[] = (flashcardRows ?? []).map((r) => {
    const row = r as unknown as FlashcardRow;
    const topic = Array.isArray(row.topics) ? row.topics[0] : row.topics;
    return {
      id: row.id,
      front: row.front,
      back: row.back,
      topicId: row.topic_id,
      topicName: topic?.name ?? null,
      createdAt: row.created_at,
    };
  });

  const counts = new Map<number, number>();
  for (const c of cards) {
    if (c.topicId !== null) counts.set(c.topicId, (counts.get(c.topicId) ?? 0) + 1);
  }

  const topics: DeckTopic[] = (topicRows ?? [])
    .filter((t) => (counts.get(t.id) ?? 0) > 0)
    .map((t) => ({ id: t.id, name: t.name, count: counts.get(t.id) ?? 0 }));

  return (
    <DashboardShell
      profile={profile}
      email={user.email}
      title="Flashcards"
      eyebrow="Study aids"
      subtitle="Rapid-fire recall by topic — flip, shuffle, and drill weak areas."
    >
      <FlashcardDeck topics={topics} cards={cards} />
    </DashboardShell>
  );
}
