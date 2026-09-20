import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { toDateKey, type Audience, type CalendarEvent } from "./types";

type Db = SupabaseClient<Database>;

/** First and last day of a month, as date keys. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: toDateKey(new Date(year, month, 1)),
    to: toDateKey(new Date(year, month + 1, 0)),
  };
}

/**
 * Events in a date range that the caller is allowed to see.
 *
 * RLS does the filtering — a student gets their own entries plus whatever is aimed
 * at them, and never another student's private entry.
 */
export async function loadEvents(
  supabase: Db,
  viewerId: string,
  viewerIsStaff: boolean,
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from("calendar_events")
    .select("id, title, description, event_date, start_time, end_time, audience, created_by")
    .gte("event_date", from)
    .lte("event_date", to)
    .order("event_date")
    .order("start_time", { nullsFirst: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Author names, and the chosen-student lists for any 'selected' events.
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const selectedIds = rows.filter((r) => r.audience === "selected").map((r) => r.id);

  const [{ data: authors }, { data: targets }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", authorIds),
    selectedIds.length > 0
      ? supabase.from("calendar_event_audience").select("event_id, user_id").in("event_id", selectedIds)
      : Promise.resolve({ data: [] as { event_id: string; user_id: string }[] }),
  ]);

  const recipientIds = Array.from(new Set((targets ?? []).map((t) => t.user_id)));
  const { data: recipientProfiles } = recipientIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", recipientIds)
    : { data: [] as { id: string; full_name: string | null }[] };

  const nameOf = new Map([
    ...(authors ?? []).map((p) => [p.id, p.full_name] as const),
    ...(recipientProfiles ?? []).map((p) => [p.id, p.full_name] as const),
  ]);
  const byEvent = new Map<string, string[]>();
  for (const t of targets ?? []) {
    const list = byEvent.get(t.event_id) ?? [];
    list.push(nameOf.get(t.user_id) ?? "A student");
    byEvent.set(t.event_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    eventDate: r.event_date,
    startTime: r.start_time,
    endTime: r.end_time,
    audience: r.audience as Audience,
    createdBy: r.created_by,
    authorName: nameOf.get(r.created_by) ?? null,
    recipients: byEvent.get(r.id) ?? [],
    // Mirrors the RLS update policy.
    canEdit: r.created_by === viewerId || (r.audience !== "self" && viewerIsStaff),
  }));
}

export type StudentOption = { id: string; name: string };

/** The roster staff pick from for a 'selected' audience. */
export async function loadStudentOptions(supabase: Db): Promise<StudentOption[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .order("full_name", { nullsFirst: false })
    .limit(500);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name?.trim() || `Unnamed student (${p.id.slice(0, 6)})`,
  }));
}
