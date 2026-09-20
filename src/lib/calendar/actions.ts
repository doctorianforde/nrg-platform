"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasAtLeast } from "@/lib/auth/roles";
import { AUDIENCES, type Audience } from "./types";

export type CalendarState = { error: string } | { ok: true } | null;

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function actor() {
  const session = await getSession();
  if (!session?.profile) return null;
  return { id: session.user.id, isStaff: hasAtLeast(session.profile.role, "teacher") };
}

/** Shared parsing for create and edit. */
function readForm(fd: FormData, isStaff: boolean):
  | { error: string }
  | { title: string; description: string | null; eventDate: string; startTime: string | null; endTime: string | null; audience: Audience; recipients: string[] } {
  const title = field(fd, "title");
  const description = field(fd, "description");
  const eventDate = field(fd, "event_date");
  const startTime = field(fd, "start_time");
  const endTime = field(fd, "end_time");
  const audience = field(fd, "audience") as Audience;
  const recipients = fd.getAll("recipients").map(String).filter(Boolean);

  if (!title) return { error: "Give the event a title." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };
  if (description.length > 2000) return { error: "Keep the description under 2000 characters." };
  if (!DATE.test(eventDate)) return { error: "Choose a date." };
  if (startTime && !TIME.test(startTime)) return { error: "That start time isn't valid." };
  if (endTime && !TIME.test(endTime)) return { error: "That end time isn't valid." };
  if (endTime && !startTime) return { error: "Add a start time before an end time." };
  if (startTime && endTime && endTime < startTime) {
    return { error: "The end time is before the start time." };
  }
  if (!AUDIENCES.includes(audience)) return { error: "Choose who this is for." };
  if (audience !== "self" && !isStaff) {
    return { error: "Only teaching staff can publish an event to others." };
  }
  if (audience === "selected" && recipients.length === 0) {
    return { error: "Pick at least one student, or choose a different audience." };
  }

  return {
    title,
    description: description || null,
    eventDate,
    startTime: startTime || null,
    endTime: endTime || null,
    audience,
    recipients: audience === "selected" ? recipients : [],
  };
}

export async function createEvent(_prev: CalendarState, fd: FormData): Promise<CalendarState> {
  const me = await actor();
  if (!me) return { error: "Sign in to add an event." };

  const parsed = readForm(fd, me.isStaff);
  if ("error" in parsed) return parsed;

  const supabase = createClient();
  const { data: event, error } = await supabase
    .from("calendar_events")
    .insert({
      title: parsed.title,
      description: parsed.description,
      event_date: parsed.eventDate,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      audience: parsed.audience,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) return { error: `Could not save the event: ${error.message}` };

  if (parsed.recipients.length > 0) {
    const { error: linkError } = await supabase
      .from("calendar_event_audience")
      .insert(parsed.recipients.map((user_id) => ({ event_id: event.id, user_id })));
    if (linkError) {
      // Without recipients a 'selected' event would reach nobody — don't leave that.
      await supabase.from("calendar_events").delete().eq("id", event.id);
      return { error: `Could not save who it's for: ${linkError.message}` };
    }
  }

  revalidatePath("/study/profile");
  return { ok: true };
}

export async function updateEvent(_prev: CalendarState, fd: FormData): Promise<CalendarState> {
  const me = await actor();
  if (!me) return { error: "Sign in to edit an event." };

  const id = field(fd, "event_id");
  if (!id) return { error: "No event selected." };
  const parsed = readForm(fd, me.isStaff);
  if ("error" in parsed) return parsed;

  const supabase = createClient();
  const { data: saved, error } = await supabase
    .from("calendar_events")
    .update({
      title: parsed.title,
      description: parsed.description,
      event_date: parsed.eventDate,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      audience: parsed.audience,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: `Could not save the event: ${error.message}` };
  if (saved?.length !== 1) return { error: "You can't edit that event." };

  if (me.isStaff) {
    // Replace the recipient list wholesale so removals take effect.
    await supabase.from("calendar_event_audience").delete().eq("event_id", id);
    if (parsed.recipients.length > 0) {
      const { error: linkError } = await supabase
        .from("calendar_event_audience")
        .insert(parsed.recipients.map((user_id) => ({ event_id: id, user_id })));
      if (linkError) return { error: `Could not save who it's for: ${linkError.message}` };
    }
  }

  revalidatePath("/study/profile");
  return { ok: true };
}

export async function deleteEvent(_prev: CalendarState, fd: FormData): Promise<CalendarState> {
  const me = await actor();
  if (!me) return { error: "Sign in to remove an event." };

  const id = field(fd, "event_id");
  const { data, error } = await createClient()
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: `Could not remove the event: ${error.message}` };
  if (data?.length !== 1) return { error: "You can't remove that event." };

  revalidatePath("/study/profile");
  return { ok: true };
}
