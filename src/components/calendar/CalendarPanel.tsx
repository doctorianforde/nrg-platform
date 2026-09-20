"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { deleteEvent, type CalendarState } from "@/lib/calendar/actions";
import {
  AUDIENCE_LABEL,
  AUDIENCE_TONE,
  fmtEventWhen,
  MONTH_NAMES,
  monthKey,
  toDateKey,
  type CalendarEvent,
} from "@/lib/calendar/types";
import type { StudentOption } from "@/lib/calendar/queries";
import { EventForm } from "./EventForm";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DeleteButton({ id }: { id: string }) {
  const [state, action] = useFormState<CalendarState, FormData>(deleteEvent, null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted-foreground hover:text-red-700"
      >
        Remove
      </button>
    );
  }
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="event_id" value={id} />
      <button type="submit" className="text-xs font-medium text-red-700 hover:underline">
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-muted-foreground"
      >
        Cancel
      </button>
      {state && "error" in state ? (
        <span role="alert" className="text-xs text-red-700">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function EventRow({
  event,
  isStaff,
  students,
}: {
  event: CalendarEvent;
  isStaff: boolean;
  students: StudentOption[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
        <EventForm
          isStaff={isStaff}
          students={students}
          defaultDate={event.eventDate}
          event={event}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-card-foreground">{event.title}</span>
        <Badge tone={AUDIENCE_TONE[event.audience]}>{AUDIENCE_LABEL[event.audience]}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{fmtEventWhen(event)}</span>
      </div>
      {event.description ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.description}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {event.audience !== "self" ? <span>Set by {event.authorName ?? "teaching staff"}</span> : null}
        {event.recipients.length > 0 ? <span>For: {event.recipients.join(", ")}</span> : null}
        {event.canEdit ? (
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-brand-700 hover:underline"
            >
              Edit
            </button>
            <DeleteButton id={event.id} />
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Month grid plus the selected day's events.
 *
 * Month navigation is a link so the server re-queries with the right range;
 * picking a day within the loaded month is local state and needs no round trip.
 */
export function CalendarPanel({
  year,
  month,
  events,
  isStaff,
  students,
  todayKey,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  isStaff: boolean;
  students: StudentOption[];
  /** Computed on the server so the highlight matches the viewer's day. */
  todayKey: string;
}) {
  const [selected, setSelected] = useState<string>(() => {
    const first = toDateKey(new Date(year, month, 1));
    const last = toDateKey(new Date(year, month + 1, 0));
    return todayKey >= first && todayKey <= last ? todayKey : first;
  });
  const [adding, setAdding] = useState(false);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.eventDate) ?? [];
    list.push(e);
    byDay.set(e.eventDate, list);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first offset.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = month === 0 ? monthKey(year - 1, 11) : monthKey(year, month - 1);
  const next = month === 11 ? monthKey(year + 1, 0) : monthKey(year, month + 1);
  const dayEvents = byDay.get(selected) ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <a
            href={`/study/profile?m=${prev}#calendar`}
            className="rounded-lg border border-border px-2 py-1 text-sm text-card-foreground hover:bg-muted"
            aria-label="Previous month"
          >
            ‹
          </a>
          <p className="font-heading font-semibold text-card-foreground">
            {MONTH_NAMES[month]} {year}
          </p>
          <a
            href={`/study/profile?m=${next}#calendar`}
            className="rounded-lg border border-border px-2 py-1 text-sm text-card-foreground hover:bg-muted"
            aria-label="Next month"
          >
            ›
          </a>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1">{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={`pad-${i}`} className="h-16 rounded-lg" />;
            const key = toDateKey(new Date(year, month, day));
            const list = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelected(key);
                  setAdding(false);
                }}
                aria-current={isToday ? "date" : undefined}
                className={`h-16 rounded-lg border p-1 text-left align-top transition-colors ${
                  isSelected
                    ? "border-brand-600 bg-brand-50"
                    : isToday
                      ? "border-brand-300 bg-card"
                      : "border-border bg-card hover:bg-muted"
                }`}
              >
                <span className={`text-xs ${isToday ? "font-bold text-brand-700" : "text-card-foreground"}`}>
                  {day}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      title={e.title}
                      className={`h-1.5 w-1.5 rounded-full ${
                        e.audience === "self" ? "bg-gray-400" : "bg-brand-600"
                      }`}
                    />
                  ))}
                  {list.length > 3 ? (
                    <span className="text-[9px] leading-none text-muted-foreground">+{list.length - 3}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          A grey dot is a private entry of yours; a purple dot is from teaching staff.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-card-foreground">
            {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg border border-brand-700 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              + Add
            </button>
          ) : null}
        </div>

        {adding ? (
          <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
            <EventForm
              isStaff={isStaff}
              students={students}
              defaultDate={selected}
              onDone={() => setAdding(false)}
            />
          </div>
        ) : null}

        {dayEvents.length === 0 && !adding ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nothing on this day.
          </p>
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((e) => (
              <EventRow key={e.id} event={e} isStaff={isStaff} students={students} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
