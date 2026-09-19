"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COGNITIVE_LEVELS, DIFFICULTIES } from "@/lib/review/filters";
import { capitalize } from "@/lib/format";
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

  const domain = domains.find((d) => d.id === domainId);
  const topic = topics.find((t) => t.id === topicId);

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <h2 className="font-heading text-lg font-semibold">Set up a practice session</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tutor mode: instant feedback, the explanation, and every option&apos;s rationale
          after each answer.
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Focus
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Number of questions
            </div>
            <div className="flex flex-wrap gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={
                    count === n
                      ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground hover:border-brand-300 hover:bg-brand-50"
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cognitive level <span className="font-normal normal-case">(optional)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCognitive("")}
                className={
                  !cognitive
                    ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground hover:border-brand-300 hover:bg-brand-50"
                }
              >
                Mixed (all)
              </button>
              {COGNITIVE_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setCognitive(l)}
                  className={
                    cognitive === l
                      ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground hover:border-brand-300 hover:bg-brand-50"
                  }
                >
                  {capitalize(l)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Difficulty <span className="font-normal normal-case">(optional)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDifficulty("")}
                className={
                  !difficulty
                    ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                    : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground hover:border-brand-300 hover:bg-brand-50"
                }
              >
                Any
              </button>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={
                    difficulty === d
                      ? "rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground hover:border-brand-300 hover:bg-brand-50"
                  }
                >
                  {capitalize(d)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-2 lg:sticky lg:top-24">
        <h3 className="font-heading font-semibold">Session summary</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Domain</dt>
            <dd className="text-right font-medium text-card-foreground">
              {domain ? `${domain.name} (${domain.code})` : "All domains"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Topic</dt>
            <dd className="text-right font-medium text-card-foreground">
              {topic ? topic.name : domain ? "All topics in domain" : "Any"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Level</dt>
            <dd className="text-right font-medium text-card-foreground">
              {cognitive ? capitalize(cognitive) : "Mixed"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="text-right font-medium text-card-foreground">
              {difficulty ? capitalize(difficulty) : "Any"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Questions</dt>
            <dd className="text-right font-medium text-card-foreground">{count}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Mode</dt>
            <dd className="text-right font-medium text-card-foreground">Tutor feedback</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={start}
          className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-brand-800"
        >
          ▶ Start session
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Explanations and rationales shown after every answer.
        </p>
      </Card>
    </div>
  );
}
