"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { heuristicInterpret, type InterpretResult, type TopicRow } from "@/lib/generation/interpret";
import { buildMcqPlan } from "@/lib/generation/plan";
import {
  describeRequest, MAX_PROMPT_CHARS, validateRequest,
  type CaseSelections, type GenerationRequest, type McqSelections, type TopicRef,
} from "@/lib/generation/request";
import {
  CASE_DIFFICULTIES, CASE_SPECIALTIES, CLUSTERS, DOMAINS, GENERATOR_KINDS, MCQ_DIFFICULTIES, TAXONOMY,
  type GeneratorKind,
} from "@/lib/generation/taxonomy";
import { queueRequest, type QueueState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const labelCls = "mb-1.5 block text-sm font-medium text-card-foreground";
const hintCls = "mt-1 text-xs text-muted-foreground";

type Opt = { code: string; name: string };
const DIFF_OPTS = MCQ_DIFFICULTIES.map((d) => ({ code: d, name: d[0].toUpperCase() + d.slice(1) }));
const CASE_DIFF_OPTS = CASE_DIFFICULTIES.map((d) => ({ code: d, name: d[0].toUpperCase() + d.slice(1) }));

/** Two-way pill switch (Questions / Case studies, Describe it / Choose it). */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-all",
              on ? "border-primary bg-brand-50 shadow-sm ring-2 ring-ring/20" : "border-border bg-card hover:border-brand-300 hover:bg-brand-50/50"
            )}
          >
            <span className={cn("block font-heading text-sm font-semibold", on ? "text-brand-800" : "text-card-foreground")}>{o.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select as toggle chips. Empty means "blueprint mix" (or the planner's default). */
function Chips({ options, value, onChange, label, hint, emptyLabel }: { options: readonly Opt[]; value: string[]; onChange: (v: string[]) => void; label: string; hint?: string; emptyLabel: string }) {
  return (
    <fieldset>
      <legend className={labelCls}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.code);
          return (
            <button
              key={o.code} type="button" aria-pressed={on} title={o.name}
              onClick={() => onChange(on ? value.filter((v) => v !== o.code) : [...value, o.code])}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-card-foreground hover:border-brand-300 hover:bg-brand-50"
              )}
            >
              {o.code.toLowerCase() !== o.name.toLowerCase() ? (
                <><span className="font-semibold">{o.code}</span><span className="ml-1 hidden font-normal sm:inline">{o.name}</span></>
              ) : o.name}
            </button>
          );
        })}
      </div>
      <p className={hintCls}>{value.length ? hint ?? "Only the selected ones, split evenly." : emptyLabel}</p>
    </fieldset>
  );
}

function TopicPicker({ topics, value, onChange }: { topics: TopicRow[]; value: TopicRef[]; onChange: (v: TopicRef[]) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return topics.filter((t) => t.name.toLowerCase().includes(s) && !value.some((v) => v.id === t.id)).slice(0, 12);
  }, [q, topics, value]);
  const cluster = (c?: string | null) => CLUSTERS.find((x) => x.code === c)?.name ?? "No cluster";
  return (
    <div>
      <label htmlFor="topic-search" className={labelCls}>Topics <span className="font-normal text-muted-foreground">(optional)</span></label>
      {value.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((t) => (
            <span key={t.id ?? t.name} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200/70">
              {t.name}
              <button type="button" aria-label={`Remove ${t.name}`} onClick={() => onChange(value.filter((v) => v !== t))} className="rounded-full px-1.5 text-brand-700 hover:bg-brand-200">×</button>
            </span>
          ))}
        </div>
      ) : null}
      <input id="topic-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 1,200+ topics, e.g. postpartum, delegation, asthma" className={inputCls} autoComplete="off" />
      {hits.length ? (
        <ul className="mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-card shadow-sm">
          {hits.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => { onChange([...value, { id: t.id, name: t.name, ...(t.cluster ? { cluster: t.cluster } : {}) }]); setQ(""); }}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50">
                <span className="text-card-foreground">{t.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{cluster(t.cluster)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim().length >= 2 ? <p className={hintCls}>No topic matches “{q.trim()}”.</p> : null}
      <p className={hintCls}>{value.length ? "Questions are spread evenly across these topics; each takes its topic's cluster." : "Leave empty to spread questions across the clusters below."}</p>
    </div>
  );
}

function ConditionPicker({ catalog, value, onChange }: { catalog: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const add = () => { const c = q.trim(); if (c && !value.includes(c)) onChange([...value, c]); setQ(""); };
  return (
    <div>
      <label htmlFor="condition" className={labelCls}>Conditions <span className="font-normal text-muted-foreground">(optional)</span></label>
      {value.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200/70">
              {c}{catalog.includes(c) ? null : <span className="font-normal text-brand-600">(new)</span>}
              <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((v) => v !== c))} className="rounded-full px-1.5 text-brand-700 hover:bg-brand-200">×</button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input id="condition" list="case-conditions" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Pick from the catalog or type a new one" className={inputCls} autoComplete="off" />
        <button type="button" onClick={add} className="shrink-0 rounded-lg border border-border bg-card px-4 text-sm font-medium text-card-foreground hover:bg-brand-50">Add</button>
      </div>
      <datalist id="case-conditions">{catalog.map((c) => <option key={c} value={c} />)}</datalist>
      <p className={hintCls}>Empty: the planner picks the next conditions without a case yet. A new condition needs a specialty.</p>
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || disabled}
      className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md disabled:opacity-50">
      {pending ? "Queueing…" : "Queue it"}
    </button>
  );
}

const PROMPT_EXAMPLES: Record<GeneratorKind, string> = {
  mcq: "e.g. 15 hard analysis questions on postpartum haemorrhage, focusing on what the nurse does first",
  case_study: "e.g. Two challenging maternal cases on pre-eclampsia, with a delegation question for the extension",
};

export function GenerateForm({ topics, caseConditions, dropDifficulty }: { topics: TopicRow[]; caseConditions: string[]; dropDifficulty: boolean }) {
  const [kind, setKind] = useState<GeneratorKind>("mcq");
  const [mode, setMode] = useState<"prompted" | "auto">("prompted");
  const [count, setCount] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [interp, setInterp] = useState<InterpretResult | null>(null); // prompted: set once Jade checks the prompt
  const [mcq, setMcq] = useState<McqSelections>({});
  const [cs, setCs] = useState<CaseSelections>({});
  const [state, action] = useFormState<QueueState, FormData>(queueRequest, null);

  const ctx = useMemo(() => ({ topics, caseConditions, allowSata: false }), [topics, caseConditions]);
  const live = useMemo(() => (mode === "prompted" && prompt.trim().length > 3 ? heuristicInterpret(kind, prompt, ctx) : null), [mode, prompt, kind, ctx]);
  const reset = () => { setInterp(null); setMcq({}); setCs({}); };

  // Prompted: "Check what I asked for" copies the interpretation into the controls; Jade's edits there win.
  const checkPrompt = () => {
    if (!live) return;
    setInterp(live);
    if (kind === "mcq") setMcq(live.selections as McqSelections); else setCs(live.selections as CaseSelections);
    if (!count && live.count) setCount(String(live.count));
  };

  const showControls = mode === "auto" || interp !== null;
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? Object.keys(v as object) : []);
  const opt = <T,>(v: T[] | undefined) => (v && v.length ? v : undefined);

  const request = useMemo(() => {
    const n = Number(count);
    const selections = kind === "mcq"
      ? { domains: opt(list(mcq.domains)), taxonomy: opt(list(mcq.taxonomy)), clusters: mcq.topics?.length ? undefined : opt(list(mcq.clusters)), topics: opt(mcq.topics), difficulty: dropDifficulty ? undefined : opt(list(mcq.difficulty)), exclusions: mcq.exclusions?.trim() || undefined }
      : { ...cs, specialties: opt(cs.specialties), conditions: opt(cs.conditions), difficulty: opt(cs.difficulty), primary_domains: opt(cs.primary_domains), extension_domains: opt(cs.extension_domains), population: cs.population?.trim() || undefined, setting: cs.setting?.trim() || undefined };
    for (const k of Object.keys(selections) as (keyof typeof selections)[]) if (selections[k] === undefined) delete selections[k];
    return validateRequest({
      kind, mode, ...(count ? { count: n } : {}), ...(title.trim() ? { title: title.trim() } : {}), ...(prompt.trim() ? { prompt: prompt.trim() } : {}), selections,
      ...(mode === "prompted" && interp ? { interpretation: { by: "heuristic (teacher UI)", at: new Date().toISOString(), notes: interp.notes, conflicts: interp.conflicts, unresolved: interp.unresolved, confirmed: false } } : {}),
    });
  }, [kind, mode, count, title, prompt, mcq, cs, interp, dropDifficulty]);

  const req: GenerationRequest | null = request.ok ? request.request : null;
  const plan = req && req.kind === "mcq" && req.count ? buildMcqPlan(req.count, req.selections, { withDifficulty: !dropDifficulty }) : null;
  const max = GENERATOR_KINDS.find((k) => k.kind === kind)!.maxCount;
  const problems = request.ok ? (req && !req.count ? ["Say how many, here or in the prompt."] : []) : request.errors;
  const canQueue = showControls && request.ok && !!req?.count && !(mode === "prompted" && !prompt.trim());

  return (
    <form action={action} className="space-y-5">
      <Card className="space-y-4 motion-safe:animate-rise-in">
        <CardTitle>What do you want to write?</CardTitle>
        <Segmented label="Content type" value={kind} onChange={(v) => { setKind(v); reset(); }} options={[
          { value: "mcq", label: "Questions", hint: "Stand-alone RENR multiple-choice questions" },
          { value: "case_study", label: "Case studies", hint: "Unfolding cases with eight questions each" },
        ]} />
        <Segmented label="How you ask" value={mode} onChange={(v) => { setMode(v); setInterp(null); }} options={[
          { value: "prompted", label: "Describe it", hint: "Write what you want in your own words" },
          { value: "auto", label: "Choose it", hint: "Pick domain, topic, taxonomy and difficulty" },
        ]} />
      </Card>

      {mode === "prompted" ? (
        <Card className="space-y-3">
          <label htmlFor="gen-prompt" className="block font-heading font-semibold text-card-foreground">Your request</label>
          <textarea id="gen-prompt" rows={4} maxLength={MAX_PROMPT_CHARS} value={prompt} onChange={(e) => { setPrompt(e.target.value); setInterp(null); }}
            className={inputCls} placeholder={PROMPT_EXAMPLES[kind]} />
          <p className={hintCls}>
            Your words go to the question writer as guidance. They can&apos;t switch off the item-writing standard (entry-level RN scope, glucose in mg/dL, one best answer).
          </p>
          {live ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm" aria-live="polite">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">What I can read so far</p>
              {live.notes.length ? (
                <div className="flex flex-wrap gap-1.5">{live.notes.map((n) => <Badge key={n} tone="purple">{n}</Badge>)}</div>
              ) : <p className="text-muted-foreground">Nothing specific yet: the blueprint mix will be used.</p>}
              {live.conflicts.map((c) => <p key={c} className="mt-2 text-red-700">✗ Won&apos;t be followed: {c}</p>)}
              {live.unresolved.filter((u) => !u.startsWith("no topic list")).map((u) => <p key={u} className="mt-2 text-muted-foreground">? Kept as guidance only: {u}</p>)}
            </div>
          ) : null}
          {!interp ? (
            <button type="button" onClick={checkPrompt} disabled={!live}
              className="rounded-lg border border-primary bg-card px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-brand-50 disabled:opacity-50">
              Check what I asked for →
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Check the choices below. Change anything that&apos;s wrong; your changes win.</p>
          )}
        </Card>
      ) : null}

      {showControls ? (
        <Card className="space-y-5">
          <CardTitle>{mode === "prompted" ? "Check the choices" : "Choose"}</CardTitle>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div>
              <label htmlFor="gen-count" className={labelCls}>How many</label>
              <input id="gen-count" type="number" min={1} max={max} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} placeholder={`1–${max}`} />
            </div>
            <div>
              <label htmlFor="gen-title" className={labelCls}>Name <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input id="gen-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} placeholder="e.g. PPH revision set" />
            </div>
          </div>

          {mode === "auto" ? (
            <div>
              <label htmlFor="gen-note" className={labelCls}>Note to the writer <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="gen-note" rows={2} maxLength={MAX_PROMPT_CHARS} value={prompt} onChange={(e) => setPrompt(e.target.value)} className={inputCls}
                placeholder="Anything else: a focus, a style, a scenario to avoid" />
            </div>
          ) : null}

          {kind === "mcq" ? (
            <>
              <Chips label="Domains" options={DOMAINS} value={list(mcq.domains)} onChange={(v) => setMcq({ ...mcq, domains: v as McqSelections["domains"] })} emptyLabel="None selected: the RENR blueprint mix (NP 30%, CDM 20%, NLM 15%, …)." />
              <Chips label="Taxonomy" options={TAXONOMY} value={list(mcq.taxonomy)} onChange={(v) => setMcq({ ...mcq, taxonomy: v as McqSelections["taxonomy"] })} emptyLabel="None selected: the RENR mix (Application 50%, Analysis 30%, Knowledge 20%)." />
              <TopicPicker topics={topics} value={mcq.topics ?? []} onChange={(v) => setMcq({ ...mcq, topics: v })} />
              {mcq.topics?.length ? null : (
                <Chips label="Clusters" options={CLUSTERS} value={list(mcq.clusters)} onChange={(v) => setMcq({ ...mcq, clusters: v as McqSelections["clusters"] })} emptyLabel="None selected: the study-cluster mix (Med-surg 30%, Safety 22%, …)." />
              )}
              {dropDifficulty ? null : (
                <Chips label="Difficulty" options={DIFF_OPTS} value={list(mcq.difficulty)} onChange={(v) => setMcq({ ...mcq, difficulty: v as McqSelections["difficulty"] })} emptyLabel="None selected: mixed, exam-level difficulty." />
              )}
              <div>
                <label htmlFor="gen-excl" className={labelCls}>Leave out <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input id="gen-excl" value={mcq.exclusions ?? ""} onChange={(e) => setMcq({ ...mcq, exclusions: e.target.value })} className={inputCls} placeholder="e.g. no paediatric dosing" />
              </div>
            </>
          ) : (
            <>
              <Chips label="Specialty" options={CASE_SPECIALTIES} value={cs.specialties ?? []} onChange={(v) => setCs({ ...cs, specialties: v as CaseSelections["specialties"] })} emptyLabel="None selected: the catalog's mix (Med-surg 40%, Paediatric 20%, …)." hint="Cases come only from these specialties." />
              <ConditionPicker catalog={caseConditions} value={cs.conditions ?? []} onChange={(v) => setCs({ ...cs, conditions: v })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="gen-pop" className={labelCls}>Patient <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <input id="gen-pop" value={cs.population ?? ""} onChange={(e) => setCs({ ...cs, population: e.target.value })} className={inputCls} placeholder="e.g. Older adult" />
                </div>
                <div>
                  <label htmlFor="gen-set" className={labelCls}>Setting <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <input id="gen-set" value={cs.setting ?? ""} onChange={(e) => setCs({ ...cs, setting: e.target.value })} className={inputCls} placeholder="e.g. District health centre" />
                </div>
              </div>
              <Chips label="Difficulty" options={CASE_DIFF_OPTS} value={cs.difficulty ?? []} onChange={(v) => setCs({ ...cs, difficulty: v as CaseSelections["difficulty"] })} emptyLabel="None selected: rotated moderate / high / low." hint="Cases rotate through the selected levels." />
              <Chips label="Primary domain" options={DOMAINS} value={cs.primary_domains ?? []} onChange={(v) => setCs({ ...cs, primary_domains: v as CaseSelections["primary_domains"] })} emptyLabel="None selected: alternates CDM and NP (V3 standard)." hint="Cases rotate through these. V3 expects CDM or NP." />
              <Chips label="Q7–Q8 extension domains" options={DOMAINS} value={cs.extension_domains ?? []} onChange={(v) => setCs({ ...cs, extension_domains: v as CaseSelections["extension_domains"] })} emptyLabel="None selected: chosen to balance the case bank." hint="Q7 and Q8 cycle through these." />
            </>
          )}
        </Card>
      ) : null}

      {showControls ? (
        <Card className="space-y-3 border-brand-200">
          <CardTitle>Summary</CardTitle>
          {req ? (
            <ul className="space-y-1 text-sm text-card-foreground">
              {describeRequest(req).filter((l) => !l.startsWith("Interpreted by") && !l.startsWith("  ") && !(dropDifficulty && kind === "mcq" && l.startsWith("Difficulty:"))).map((l) => <li key={l}>{l}</li>)}
            </ul>
          ) : null}
          {plan ? (
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              {[["Domains", plan.dCounts], ["Taxonomy", plan.tCounts], [plan.topicCounts ? "Topics" : "Clusters", plan.topicCounts ?? plan.cCounts]].map(([name, counts]) => (
                <div key={name as string} className="rounded-lg bg-muted/50 p-2.5">
                  <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">{name as string}</p>
                  <ul className="space-y-0.5 tabular-nums text-card-foreground">
                    {Object.entries(counts as Record<string, number>).filter(([, n]) => n > 0).map(([k, n]) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span>{n}</span></li>)}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
          {interp?.conflicts.map((c) => <p key={c} className="text-sm text-red-700">✗ Won&apos;t be followed: {c}</p>)}
          {request.warnings.filter((w) => !w.includes("not been confirmed")).map((w) => <p key={w} className="text-sm text-amber-700">! {w}</p>)}
          {problems.map((p) => <p key={p} className="text-sm text-red-700">{p}</p>)}
          {state?.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
          <input type="hidden" name="request" value={req ? JSON.stringify(req) : ""} />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton disabled={!canQueue} />
            <p className="text-xs text-muted-foreground">Nothing goes to students: new {kind === "mcq" ? "questions land in the review queue" : "cases arrive in review"} for you to check.</p>
          </div>
        </Card>
      ) : null}
    </form>
  );
}
