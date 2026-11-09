import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Recordings library (20261109200000; build plan "NRG Recordings Library: Build Plan"). Students see published
 * recordings' details (RLS); who may PLAY is decided by recording_playback_allowed() with the student's own token, and
 * only then does the server sign a short-lived link to the private video (phase 1: Supabase Storage).
 */

export type RecordingKind = "lecture" | "session" | "short";
export const KIND_LABEL: Record<RecordingKind, string> = { lecture: "Lecture", session: "Recorded session", short: "Short explainer" };

export type RecordingCard = {
  id: string;
  slug: string;
  title: string;
  kind: RecordingKind;
  presenter: string | null;
  description: string | null;
  durationSeconds: number;
  thumbnailUrl: string | null;
  freeSample: boolean;
  status: "draft" | "published";
  publishedAt: string | null;
  domain: { id: number; code: string; name: string } | null;
  cognitiveLevel: string | null;
  reviews: { slug: string; title: string }[];
  progress: { positionSeconds: number; furthestSeconds: number; watched: boolean } | null;
  /** The signed-in user may play it (paid plan, free sample, or staff). */
  playable: boolean;
};

export type RecordingFull = RecordingCard & {
  notes: string | null;
  transcript: { t: number; text: string }[];
  chapters: { start: number; title: string }[];
  recordedOn: string | null;
};

export const thumbUrl = (path: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recording-thumbnails/${path}` : null;

export const fmtLength = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

type Row = {
  id: string; slug: string; title: string; kind: RecordingKind; presenter: string | null; description: string | null;
  duration_seconds: number; thumbnail_path: string | null; free_sample: boolean; status: "draft" | "published";
  published_at: string | null; domain_id: number | null; cognitive_level: string | null;
};
const COLS = "id, slug, title, kind, presenter, description, duration_seconds, thumbnail_path, free_sample, status, published_at, domain_id, cognitive_level";

/** Every recording the caller may see (published; staff also drafts), newest first, with their progress and access.
 *  Returns null on a database without the recordings migration. */
export async function listRecordings(userId: string, paid: boolean, staff: boolean): Promise<RecordingCard[] | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("recordings").select(COLS).order("published_at", { ascending: false, nullsFirst: true });
  if (error) return null;
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: links }, { data: progress }, { data: domains }, { data: reviews }] = await Promise.all([
    supabase.from("recording_links").select("recording_id, review_slug").in("recording_id", ids),
    supabase.from("recording_progress").select("recording_id, position_seconds, furthest_seconds, watched_at").eq("user_id", userId).in("recording_id", ids),
    supabase.from("domains").select("id, code, name"),
    supabase.from("topic_reviews").select("slug, title"),
  ]);
  const titleOf = new Map((reviews ?? []).map((r) => [r.slug, r.title]));
  return rows.map((r) => {
    const p = (progress ?? []).find((x) => x.recording_id === r.id);
    const d = (domains ?? []).find((x) => x.id === r.domain_id);
    return {
      id: r.id, slug: r.slug, title: r.title, kind: r.kind, presenter: r.presenter, description: r.description,
      durationSeconds: r.duration_seconds, thumbnailUrl: thumbUrl(r.thumbnail_path), freeSample: r.free_sample, status: r.status,
      publishedAt: r.published_at, domain: d ? { id: d.id, code: d.code, name: d.name } : null, cognitiveLevel: r.cognitive_level,
      // Only reviews the viewer can open (students: published ones; RLS hides drafts, so their titles don't load).
      reviews: (links ?? []).filter((l) => l.recording_id === r.id && titleOf.has(l.review_slug)).map((l) => ({ slug: l.review_slug, title: titleOf.get(l.review_slug)! })),
      progress: p ? { positionSeconds: p.position_seconds, furthestSeconds: p.furthest_seconds, watched: !!p.watched_at } : null,
      playable: staff || (r.status === "published" && (r.free_sample || paid)),
    };
  });
}

export async function getRecording(slug: string, userId: string, paid: boolean, staff: boolean): Promise<RecordingFull | null> {
  const supabase = createClient();
  const { data } = await supabase.from("recordings").select(`${COLS}, notes, transcript, recorded_on`).eq("slug", slug).maybeSingle();
  if (!data) return null;
  const r = data as unknown as Row & { notes: string | null; transcript: { t: number; text: string }[] | null; recorded_on: string | null };
  const [list, { data: chapters }] = await Promise.all([
    listRecordings(userId, paid, staff),
    supabase.from("recording_chapters").select("position, start_seconds, title").eq("recording_id", r.id).order("position"),
  ]);
  const card = list?.find((x) => x.id === r.id);
  if (!card) return null;
  return {
    ...card,
    notes: r.notes,
    transcript: Array.isArray(r.transcript) ? r.transcript : [],
    chapters: (chapters ?? []).map((c) => ({ start: c.start_seconds, title: c.title })),
    recordedOn: r.recorded_on,
  };
}

/**
 * A playback link, only if the database says the caller may play this recording (checked with their own token).
 * Phase 1 signs the private Storage file; the link lasts twice the recording's length (at least 10 minutes) so seeking
 * keeps working, and dies after that.
 */
export async function playbackUrl(recordingId: string): Promise<string | null> {
  const supabase = createClient();
  const { data: ok } = await supabase.rpc("recording_playback_allowed", { p_recording: recordingId });
  if (ok !== true) return null;
  const { data: rec } = await adminClient.from("recordings").select("host, host_ref, duration_seconds").eq("id", recordingId).maybeSingle();
  if (!rec || rec.host !== "supabase") return null; // phase 2 adds the video host here
  const ttl = Math.min(6 * 3600, Math.max(600, rec.duration_seconds * 2));
  const { data: signed } = await adminClient.storage.from("recordings").createSignedUrl(rec.host_ref, ttl);
  return signed?.signedUrl ?? null;
}
