"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitQuestion, type SubmitState } from "@/lib/xp/actions";
import { COGNITIVE_LEVELS, DIFFICULTIES } from "@/lib/review/filters";
import { capitalize } from "@/lib/format";

const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground";
const LETTERS = ["a", "b", "c", "d"] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Submitting…" : "Submit for review"}
    </button>
  );
}

export function SubmitQuestionForm({
  domains,
  xpPerQuestion,
}: {
  domains: { id: number; code: string; name: string }[];
  xpPerQuestion: number;
}) {
  const [state, action] = useFormState<SubmitState, FormData>(submitQuestion, null);
  const formRef = useRef<HTMLFormElement>(null);
  const succeeded = Boolean(state && "ok" in state);

  return (
    <form
      ref={formRef}
      action={action}
      key={succeeded ? "fresh" : "editing"}
      className="space-y-4"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">The question</span>
        <textarea
          name="body"
          rows={5}
          required
          maxLength={4000}
          placeholder="A 68-year-old client with heart failure reports…  Which action should the nurse take first?"
          className={input}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Write a clinical scenario, then ask one clear thing.
        </span>
      </label>

      <fieldset className="text-sm">
        <legend className="mb-1 font-medium text-card-foreground">
          Four options — mark the correct one
        </legend>
        <div className="space-y-2">
          {LETTERS.map((k) => (
            <div key={k} className="flex items-start gap-2">
              <input
                type="radio"
                name="correct"
                value={k}
                required
                className="mt-3"
                aria-label={`Option ${k.toUpperCase()} is correct`}
              />
              <span className="mt-2.5 w-4 font-semibold uppercase text-muted-foreground">{k}</span>
              <input name={`option_${k}`} required maxLength={500} className={input} />
            </div>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">
          Why is that the answer?
        </span>
        <textarea
          name="explanation"
          rows={4}
          required
          maxLength={4000}
          placeholder="Explain the reasoning, and why the other options fall short."
          className={input}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          This is the part a teacher weighs most — a question without sound reasoning gets sent back.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Domain</span>
          <select name="domain_id" required defaultValue="" className={input}>
            <option value="" disabled>
              Choose…
            </option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">
            Level <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <select name="cognitive_level" defaultValue="" className={input}>
            <option value="">Not sure</option>
            {COGNITIVE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {capitalize(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">
            Difficulty <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <select name="difficulty" defaultValue="" className={input}>
            <option value="">Not sure</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {capitalize(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state && "error" in state ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      {state && "ok" in state ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.ok}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Worth <strong>{xpPerQuestion} XP</strong> once approved.
        </p>
        <Submit />
      </div>
    </form>
  );
}
