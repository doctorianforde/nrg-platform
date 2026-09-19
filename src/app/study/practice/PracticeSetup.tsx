"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COGNITIVE_LEVELS, DIFFICULTIES } from "@/lib/review/filters";
import { Card } from "@/components/ui/Card";

type Domain = { id: number; name: string; code: string };
type Topic = { id: number; name: string };

const COUNTS = [5, 10, 20, 50];

export function PracticeSetup({ domains }: { domains: Domain[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [domainId, setDomainId] = useState<number | "">(
    Number(searchParams.get("domain")) || ""
  );
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<number | "">("");
  const [cognitive, setCognitive] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [count, setCount] = useState(10);

  useEffect(() => {
    if (!domainId) {
      setTopics([]);
      setTopicId("");
      return;
    }
    let cancelled = false;
    createClient()
      .from("topics")
      .select("id, name")
      .eq("domain_id", domainId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setTopics((data ?? []) as Topic[]);
        setTopicId("");
      });
    return () => {
      cancelled = true;
    };
  }, [domainId]);

  const start = () => {
    const p = new URLSearchParams();
    if (domainId) p.set("domain", String(domainId));
    if (topicId) p.set("topic", String(topicId));
    if (cognitive) p.set("cognitive", cognitive);
    if (difficulty) p.set("difficulty", difficulty);
    p.set("count", String(count));
    router.push(`/study/practice/session?${p.toString()}`);
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <h2 className="font-heading text-lg font-semibold">Set up a practice session</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tutor mode: you get instant feedback, the explanation, and every option&apos;s
        rationale after each answer.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Domain</span>
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value ? Number(e.target.value) : "")}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Topic</span>
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : "")}
            disabled={!domainId || topics.length === 0}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">
              {!domainId ? "Pick a domain first" : "All topics in domain"}
            </option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Cognitive level</span>
          <select
            value={cognitive}
            onChange={(e) => setCognitive(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="">Any level</option>
            {COGNITIVE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Difficulty</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-card-foreground">
            Number of questions
          </span>
          <div className="flex gap-2">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={
                  count === n
                    ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    : "rounded-md border border-border bg-card px-4 py-2 text-sm text-card-foreground hover:bg-muted"
                }
              >
                {n}
              </button>
            ))}
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={start}
        className="mt-6 w-full rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-brand-800"
      >
        Start practice
      </button>
    </Card>
  );
}
