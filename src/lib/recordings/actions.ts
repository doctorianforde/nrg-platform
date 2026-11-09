"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { hasAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/** Student: save where they are in a recording (the database clamps it and marks 90% as watched). */
export async function saveRecordingProgress(recordingId: string, positionSeconds: number): Promise<void> {
  const { error } = await createClient().rpc("save_recording_progress", { p_recording: recordingId, p_position: Math.floor(positionSeconds) });
  if (error && !/not available/.test(error.message)) console.error("save_recording_progress", error.message);
}

export type RecordingFormResult = { error?: string } | null;

/** "mm:ss Title" or "h:mm:ss Title" per line → [{start, title}]. Lines that don't parse are reported. */
function parseTimed(text: string, label: string): { rows: { start: number; text: string }[]; error?: string } {
  const rows: { start: number; text: string }[] = [];
  const all = text.split("\n");
  for (let i = 0; i < all.length; i++) {
    const raw = all[i];
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{1,2}:)?(\d{1,2}):(\d{2})\s+(.+)$/.exec(line);
    if (!m) return { rows, error: `${label}, line ${i + 1}: start with a time like 12:30, then the text.` };
    const start = (m[1] ? Number(m[1].slice(0, -1)) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]);
    rows.push({ start, text: m[4].trim() });
  }
  return { rows };
}

/** Staff: create or update a recording from the teacher form. The video and thumbnail were uploaded by the browser. */
export async function saveRecording(_prev: RecordingFormResult, fd: FormData): Promise<RecordingFormResult> {
  const session = await getSession();
  if (!session?.profile || !hasAtLeast(session.profile.role, "teacher")) return { error: "Teachers and admins only." };
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const id = s("id") || null;
  const title = s("title");
  const slug = (s("slug") || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const duration = Math.round(Number(s("duration_seconds")));
  const kind = s("kind");
  const status = s("status") === "published" ? "published" : "draft";
  const consent = fd.get("consent_confirmed") === "on";
  if (title.length < 3) return { error: "Give the recording a title." };
  if (!s("host_ref")) return { error: "Upload the video first." };
  if (!Number.isFinite(duration) || duration <= 0) return { error: "The video's length couldn't be read. Upload it again." };
  if (!["lecture", "session", "short"].includes(kind)) return { error: "Choose the type of recording." };
  if (status === "published" && kind === "session" && !consent) {
    return { error: "Confirm that everyone in this recorded session agreed to it being shared, or that no student can be identified." };
  }
  const chapters = parseTimed(s("chapters"), "Chapters");
  if (chapters.error) return { error: chapters.error };
  const transcript = parseTimed(s("transcript"), "Transcript");
  if (transcript.error) return { error: transcript.error };
  if (chapters.rows.some((c) => c.start > duration)) return { error: "A chapter starts after the end of the video." };

  const row = {
    slug, title, kind, status,
    presenter: s("presenter") || null,
    recorded_on: s("recorded_on") || null,
    description: s("description") || null,
    notes: s("notes") || null,
    transcript: transcript.rows.map((r) => ({ t: r.start, text: r.text })),
    thumbnail_path: s("thumbnail_path") || null,
    duration_seconds: duration,
    host: "supabase",
    host_ref: s("host_ref"),
    free_sample: fd.get("free_sample") === "on",
    consent_confirmed: consent,
    domain_id: Number(s("domain_id")) || null,
    cognitive_level: s("cognitive_level") || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = createClient();
  const saved = id
    ? await supabase.from("recordings").update(row).eq("id", id).select("id, published_at").single()
    : await supabase.from("recordings").insert({ ...row, created_by: session.profile.id }).select("id, published_at").single();
  if (saved.error || !saved.data) {
    return { error: /duplicate|unique/i.test(saved.error?.message ?? "") ? "Another recording already uses that web address. Change the title or address." : "Could not save the recording. Try again." };
  }
  if (status === "published" && !saved.data.published_at) {
    await supabase.from("recordings").update({ published_at: new Date().toISOString() }).eq("id", saved.data.id);
  }
  const { error: dErr } = await supabase.rpc("set_recording_details", {
    p_recording: saved.data.id,
    p_chapters: chapters.rows.map((c) => ({ start: c.start, title: c.text })),
    p_reviews: fd.getAll("reviews").map(String),
  });
  if (dErr) return { error: "Saved, but the chapters or topic links didn't save. Open it and save again." };
  revalidatePath("/teacher/recordings");
  revalidatePath("/study/recordings");
  redirect(`/teacher/recordings?saved=${encodeURIComponent(title)}`);
}
