"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { QuestionMetaBadges } from "@/components/questions/QuestionMetaBadges";
import { addQuestion } from "./actions";

type SearchResult = {
  id: string;
  body: string;
  question_type: string;
  cognitive_level: string | null;
  difficulty: string | null;
};

const inputCls =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground";

/**
 * Search the active question bank client-side (RLS allows authenticated read;
 * only is_active=true rows are queried). Adding always goes through the
 * server action, which re-verifies ownership.
 */
export function QuestionSearch({
  setId,
  existingIds,
}: {
  setId: string;
  existingIds: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const existing = new Set(existingIds);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      createClient()
        .from("questions")
        .select("id, body, question_type, cognitive_level, difficulty")
        .eq("is_active", true)
        .ilike("body", `%${query}%`)
        .limit(20)
        .then(({ data, error: queryError }) => {
          if (cancelled) return;
          setSearching(false);
          if (queryError) {
            setError(queryError.message);
            setResults([]);
          } else {
            setError(null);
            setResults((data ?? []) as SearchResult[]);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const add = (questionId: string) => {
    setError(null);
    setAddingId(questionId);
    startTransition(async () => {
      const result = await addQuestion(setId, questionId);
      setAddingId(null);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  const visible = results.filter((r) => !existing.has(r.id));

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search active questions (min 3 characters)…"
        className={inputCls}
        aria-label="Search questions"
      />
      <p className="text-xs text-muted-foreground">
        Only active (approved) questions are listed. Questions already in this set are hidden.
      </p>
      {searching ? <p className="text-sm text-muted-foreground">Searching…</p> : null}
      {!searching && q.trim().length >= 3 && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching active questions.</p>
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {visible.map((r) => (
          <li key={r.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <QuestionMetaBadges meta={r} />
              </div>
              <p className="line-clamp-2 text-sm text-card-foreground">{r.body}</p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => add(r.id)}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
            >
              {addingId === r.id ? "Adding…" : "Add"}
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
