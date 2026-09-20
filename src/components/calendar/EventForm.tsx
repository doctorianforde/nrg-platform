"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createEvent, updateEvent, type CalendarState } from "@/lib/calendar/actions";
import {
  AUDIENCE_LABEL,
  STAFF_AUDIENCES,
  type Audience,
  type CalendarEvent,
} from "@/lib/calendar/types";
import type { StudentOption } from "@/lib/calendar/queries";

const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand-800 disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/**
 * Add or edit an event.
 *
 * Students only ever get the private "Just me" audience — the option list isn't
 * even rendered for them, and the server refuses anything else regardless.
 */
export function EventForm({
  isStaff,
  students,
  defaultDate,
  event,
  onDone,
}: {
  isStaff: boolean;
  students: StudentOption[];
  /** Pre-filled when adding from a specific day cell. */
  defaultDate: string;
  /** Present when editing. */
  event?: CalendarEvent;
  onDone?: () => void;
}) {
  const editing = Boolean(event);
  const [state, action] = useFormState<CalendarState, FormData>(
    editing ? updateEvent : createEvent,
    null
  );
  const [audience, setAudience] = useState<Audience>(event?.audience ?? "self");
  const [chosen, setChosen] = useState<string[]>([]);

  // A successful save closes the form; the page has already revalidated.
  const saved = Boolean(state && "ok" in state);
  useEffect(() => {
    if (saved) onDone?.();
  }, [saved, onDone]);

  return (
    <form action={action} className="space-y-3">
      {event ? <input type="hidden" name="event_id" value={event.id} /> : null}
      {!isStaff ? <input type="hidden" name="audience" value="self" /> : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">Title</span>
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={event?.title}
          placeholder="e.g. RENR paper 2"
          className={input}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Date</span>
          <input
            type="date"
            name="event_date"
            required
            defaultValue={event?.eventDate ?? defaultDate}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">
            From <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input type="time" name="start_time" defaultValue={event?.startTime?.slice(0, 5) ?? ""} className={input} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">
            To <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input type="time" name="end_time" defaultValue={event?.endTime?.slice(0, 5) ?? ""} className={input} />
        </label>
      </div>

      {isStaff ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-card-foreground">Who is this for?</span>
          <select
            name="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
            className={input}
          >
            {STAFF_AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {isStaff && audience === "selected" ? (
        <div className="text-sm">
          <span className="mb-1 block font-medium text-card-foreground">
            Chosen students{chosen.length > 0 ? ` (${chosen.length})` : ""}
          </span>
          {students.length === 0 ? (
            <p className="text-xs text-muted-foreground">No students have signed up yet.</p>
          ) : (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border p-2">
              {students.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-1 py-1 text-sm">
                  <input
                    type="checkbox"
                    name="recipients"
                    value={s.id}
                    onChange={(e) =>
                      setChosen((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                      )
                    }
                  />
                  <span className="text-card-foreground">{s.name}</span>
                </label>
              ))}
            </div>
          )}
          {editing ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Saving replaces the previous list with whoever is ticked here.
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-card-foreground">
          Details <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={event?.description ?? ""}
          className={input}
        />
      </label>

      {state && "error" in state ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-card-foreground"
          >
            Cancel
          </button>
        ) : null}
        <Save label={editing ? "Save changes" : "Add to calendar"} />
      </div>
    </form>
  );
}
