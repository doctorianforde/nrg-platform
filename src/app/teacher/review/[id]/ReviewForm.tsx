"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitReview, type ReviewState } from "../actions";
import { COGNITIVE_LEVELS, DIFFICULTIES } from "@/lib/review/filters";
import { capitalize } from "@/lib/format";

type Question = {
  id: string;
  updated_at: string;
  body: string;
  explanation: string;
  cognitive_level: string;
  difficulty: string;
  question_type: string;
  review_status: string;
  review_notes: string;
  is_active: boolean;
  domain: string;
  topic: string;
  cluster: string;
  options: { id: string; body: string; is_correct: boolean; rationale: string }[];
};

const LETTERS = "ABCDEFGH";
const input = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900";

function DecisionButton({ decision, className, children }: { decision: string; className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button name="decision" value={decision} disabled={pending} className={`w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50 ${className}`}>
      {children}
    </button>
  );
}

export function ReviewForm({ question: q, qs }: { question: Question; qs: string }) {
  const [state, action] = useFormState<ReviewState, FormData>(submitReview, null);
  const [editing, setEditing] = useState(false);
  const isMcq = q.question_type === "mcq";
  const reviewed = q.review_status !== "pending";

  return (
    <form action={action} className="grid gap-5 md:grid-cols-[1fr_18rem]">
      <input type="hidden" name="id" value={q.id} />
      <input type="hidden" name="updated_at" value={q.updated_at} />
      <input type="hidden" name="qs" value={qs.replace(/^\?/, "")} />
      <input type="hidden" name="edited" value={editing ? "1" : "0"} />

      <div className="space-y-4">
        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Question</h2>
            <button type="button" onClick={() => setEditing((v) => !v)} className="text-sm text-[hsl(270,60%,35%)] underline">
              {editing ? "Cancel editing" : "Edit question"}
            </button>
          </div>
          {editing ? (
            <textarea name="body" defaultValue={q.body} rows={6} className={input} />
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{q.body}</p>
          )}
        </section>

        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Answer options {isMcq ? "(one correct)" : "(select all that apply)"}
          </h2>
          <ul className="space-y-3">
            {q.options.map((o, i) => (
              <li key={o.id} className={`rounded border p-3 ${o.is_correct ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                {editing ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        type={isMcq ? "radio" : "checkbox"}
                        name="correct"
                        value={o.id}
                        defaultChecked={o.is_correct}
                        className="mt-2"
                        aria-label={`Option ${LETTERS[i]} is correct`}
                      />
                      <span className="mt-1.5 font-semibold">{LETTERS[i]}.</span>
                      <textarea name={`opt_body_${o.id}`} defaultValue={o.body} rows={2} className={input} />
                    </div>
                    <label className="block text-xs text-gray-600">
                      Rationale
                      <textarea name={`opt_rationale_${o.id}`} defaultValue={o.rationale} rows={2} className={`${input} mt-1`} />
                    </label>
                  </div>
                ) : (
                  <>
                    <p className="text-sm">
                      <span className="font-semibold">{LETTERS[i]}.</span> {o.body}
                      {o.is_correct && <span className="ml-2 rounded bg-green-600 px-1.5 py-0.5 text-xs font-medium text-white">Correct</span>}
                    </p>
                    {o.rationale && <p className="mt-1 text-xs text-gray-600">{o.rationale}</p>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Explanation</h2>
          {editing ? (
            <textarea name="explanation" defaultValue={q.explanation} rows={5} className={input} />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.explanation || <em className="text-gray-500">No explanation</em>}</p>
          )}
        </section>
      </div>

      <aside className="space-y-4 md:sticky md:top-4 md:self-start">
        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-gray-500">Domain</dt><dd>{q.domain}</dd>
            <dt className="text-gray-500">Area</dt><dd>{q.cluster}</dd>
            <dt className="text-gray-500">Topic</dt><dd>{q.topic}</dd>
            <dt className="text-gray-500">Live</dt><dd>{q.is_active ? "Yes" : "No"}</dd>
            <dt className="text-gray-500">Level</dt>
            <dd>
              {editing ? (
                <select name="cognitive_level" defaultValue={q.cognitive_level} className={input}>
                  {COGNITIVE_LEVELS.map((c) => <option key={c} value={c}>{capitalize(c)}</option>)}
                </select>
              ) : capitalize(q.cognitive_level)}
            </dd>
            <dt className="text-gray-500">Difficulty</dt>
            <dd>
              {editing ? (
                <select name="difficulty" defaultValue={q.difficulty} className={input}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{capitalize(d)}</option>)}
                </select>
              ) : capitalize(q.difficulty)}
            </dd>
          </dl>
        </section>

        <section className="rounded-lg border border-[hsl(270,15%,88%)] bg-white p-4">
          <label className="block text-sm font-medium" htmlFor="notes">Reviewer notes</label>
          <textarea id="notes" name="notes" defaultValue={q.review_notes} rows={4} className={`${input} mt-1`} placeholder="Required for “Needs changes”" />

          {state?.error && <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}

          <div className="mt-4 space-y-2">
            <DecisionButton decision="approve" className="bg-green-600 text-white hover:bg-green-700">
              {editing ? "Save edits & approve" : "Approve"} → next
            </DecisionButton>
            <DecisionButton decision="needs_changes" className="bg-amber-500 text-white hover:bg-amber-600">Needs changes → next</DecisionButton>
            <DecisionButton decision="reject" className="bg-red-600 text-white hover:bg-red-700">Reject → next</DecisionButton>
            {editing && (
              <DecisionButton decision="save" className="border border-gray-300 bg-white text-gray-900 hover:bg-gray-50">
                Save edits only
              </DecisionButton>
            )}
            {reviewed && (
              <DecisionButton decision="reset" className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                Reset to pending
              </DecisionButton>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Approve makes the question live for students. Any other decision keeps it hidden. Notes save with every decision.
          </p>
        </section>
      </aside>
    </form>
  );
}
