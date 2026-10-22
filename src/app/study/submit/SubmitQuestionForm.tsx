"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitQuestion, type SubmitState } from "@/lib/xp/actions";
import { cn } from "@/lib/cn";

const input =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const LETTERS = ["a", "b", "c", "d"] as const;

/** Rough word targets per assigned stem length, for the Stem bar's guidance only (the grader judges the real thing). */
const STEM_WORDS: Record<string, number> = { short: 25, medium: 40, medium_long: 60, long: 85 };
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md disabled:opacity-50"
    >
      {pending ? "Submitting…" : "Submit for grading"}
    </button>
  );
}

function GuideBar({ label, value, hint, optional }: { label: string; value: number; hint: string; optional?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-card-foreground">
          {label} bar{optional ? <span className="ml-1 font-normal normal-case text-muted-foreground">(optional, +5)</span> : null}
        </span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", pct >= 100 ? "bg-green-500" : "bg-gradient-to-r from-brand-400 to-brand-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export type FormAssignment = {
  id: string;
  topic: string;
  domainCode: string;
  domainName: string;
  taxonomy: string;
  taxonomyLabel: string;
  stemLength: string;
  stemLabel: string;
  stemRule: string;
};

export function SubmitQuestionForm({
  assignment,
  xpPerQuestion,
  gradingMode,
}: {
  assignment: FormAssignment;
  xpPerQuestion: number;
  gradingMode: "off" | "agent" | "api";
}) {
  const [state, action] = useFormState<SubmitState, FormData>(submitQuestion, null);
  const succeeded = Boolean(state && "ok" in state);
  const [stem, setStem] = useState("");
  const [opts, setOpts] = useState<Record<string, string>>({});
  const [correct, setCorrect] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");

  const target = STEM_WORDS[assignment.stemLength] ?? 40;
  const filled = LETTERS.filter((k) => (opts[k] ?? "").trim()).length;
  const distinct = new Set(LETTERS.map((k) => (opts[k] ?? "").trim().toLowerCase()).filter(Boolean)).size === filled;
  const optionsValue = (filled / 4) * 0.75 + (correct ? 0.25 : 0) - (distinct ? 0 : 0.25);

  if (succeeded) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 motion-safe:animate-fade-in">
          {state && "ok" in state ? state.ok : null}
        </p>
        <a href="/study/submit" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Get my next assignment
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="assignment_id" value={assignment.id} />

      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Your assignment</p>
        <p className="mt-1 font-heading text-lg font-semibold text-card-foreground">{assignment.topic}</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Domain</dt><dd className="text-card-foreground">{assignment.domainName} ({assignment.domainCode})</dd></div>
          <div><dt className="text-xs text-muted-foreground">Level</dt><dd className="text-card-foreground">{assignment.taxonomyLabel}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Stem length</dt><dd className="text-card-foreground">{assignment.stemLabel}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          {assignment.stemLabel} stem: {assignment.stemRule}. The platform picks these so your question targets what you most need to practise.
        </p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">The question (stem)</span>
        <textarea
          name="body"
          rows={5}
          required
          maxLength={4000}
          value={stem}
          onChange={(e) => setStem(e.target.value)}
          placeholder="A 68-year-old client with heart failure reports…  Which action should the nurse take first?"
          className={input}
        />
      </label>

      <fieldset className="text-sm">
        <legend className="mb-1 font-medium text-card-foreground">Four options — mark the correct one</legend>
        <div className="space-y-2">
          {LETTERS.map((k) => (
            <div key={k} className="flex items-start gap-2">
              <input
                type="radio"
                name="correct"
                value={k}
                required
                onChange={() => setCorrect(k)}
                className="mt-3"
                aria-label={`Option ${k.toUpperCase()} is correct`}
              />
              <span className="mt-2.5 w-4 font-semibold uppercase text-muted-foreground">{k}</span>
              <input
                name={`option_${k}`}
                required
                maxLength={500}
                value={opts[k] ?? ""}
                onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.value }))}
                className={input}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">
          Rationale <span className="font-normal text-muted-foreground">(optional — up to +5 points)</span>
        </span>
        <textarea
          name="explanation"
          rows={4}
          maxLength={4000}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Why is that the answer, and why does each other option fall short?"
          className={input}
        />
      </label>

      <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4">
        <GuideBar label="Stem" value={words(stem) / target} hint={`About ${target}+ words for a ${assignment.stemLabel.toLowerCase()} stem (${words(stem)} so far).`} />
        <GuideBar
          label="Options"
          value={optionsValue}
          hint={!distinct ? "Two options are the same." : correct ? `${filled} of 4 written, correct answer marked.` : `${filled} of 4 written; mark the correct one.`}
        />
        <GuideBar label="Rationale" optional value={words(rationale) / 40} hint="Explain the answer and each wrong option for the full bonus." />
        <p className="text-xs text-muted-foreground">
          These bars only check you&apos;ve filled things in. {gradingMode === "off" ? "A teacher" : "The AI grader"} scores the real
          ones: Stem /30, Options /45, fit to the assignment /25, rationale bonus +5. 75 passes.
        </p>
      </div>

      {state && "error" in state ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Worth <strong>{xpPerQuestion} XP</strong> once a teacher approves it.
        </p>
        <Submit />
      </div>
    </form>
  );
}
