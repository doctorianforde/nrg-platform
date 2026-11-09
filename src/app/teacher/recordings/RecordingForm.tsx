"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { saveRecording } from "@/lib/recordings/actions";

export type RecordingFormValues = {
  id?: string; slug?: string; title?: string; kind?: string; presenter?: string; recorded_on?: string; description?: string;
  notes?: string; chapters?: string; transcript?: string; thumbnail_path?: string; duration_seconds?: number; host_ref?: string;
  status?: string; free_sample?: boolean; consent_confirmed?: boolean; domain_id?: number | null; cognitive_level?: string | null;
  reviews?: string[];
};

const field = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const label = "block text-sm font-medium text-card-foreground";

function Save() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60">{pending ? "Saving…" : "Save recording"}</button>;
}

/**
 * Add or edit a recording. The video goes straight from the browser into the private `recordings` bucket (staff only;
 * MP4, up to 50 MB on staging until a video host is chosen); its length is read in the browser; if no thumbnail is
 * chosen, one is taken from the video at 2 seconds.
 */
export function RecordingForm({ values, domains, reviews }: { values: RecordingFormValues; domains: { id: number; name: string }[]; reviews: { slug: string; title: string }[] }) {
  const [state, action] = useFormState(saveRecording, null);
  const [hostRef, setHostRef] = useState(values.host_ref ?? "");
  const [duration, setDuration] = useState(values.duration_seconds ?? 0);
  const [thumb, setThumb] = useState(values.thumbnail_path ?? "");
  const [upload, setUpload] = useState<string | null>(null);
  const [kind, setKind] = useState(values.kind ?? "lecture");

  async function onVideo(file: File | undefined) {
    if (!file) return;
    if (file.type !== "video/mp4") return setUpload("Use an MP4 video.");
    if (file.size > 50 * 1024 * 1024) return setUpload("The video is over 50 MB. Until a video host is set up, compress it or split it.");
    setUpload("Reading the video…");
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    await new Promise<void>((ok, bad) => { v.onloadedmetadata = () => ok(); v.onerror = () => bad(); }).catch(() => undefined);
    if (!Number.isFinite(v.duration) || v.duration <= 0) { URL.revokeObjectURL(url); return setUpload("The video couldn't be read. Is it a normal MP4?"); }
    setDuration(Math.round(v.duration));
    const supabase = createClient();
    const id = crypto.randomUUID();
    setUpload("Uploading the video…");
    const up = await supabase.storage.from("recordings").upload(`uploads/${id}.mp4`, file, { contentType: "video/mp4", upsert: false });
    if (up.error) { URL.revokeObjectURL(url); return setUpload("The upload failed. Check your connection and try again."); }
    setHostRef(`uploads/${id}.mp4`);
    if (!thumb) {
      v.currentTime = Math.min(2, v.duration / 2);
      await new Promise<void>((ok) => { v.onseeked = () => ok(); });
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = Math.round((640 * (v.videoHeight || 360)) / (v.videoWidth || 640));
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
      if (blob) {
        const t = await supabase.storage.from("recording-thumbnails").upload(`uploads/${id}.jpg`, blob, { contentType: "image/jpeg", upsert: false });
        if (!t.error) setThumb(`uploads/${id}.jpg`);
      }
    }
    URL.revokeObjectURL(url);
    setUpload(`Uploaded (${Math.floor(v.duration / 60)} min ${Math.round(v.duration % 60)} s).`);
  }

  async function onThumb(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) return setUpload("The thumbnail must be a JPEG, PNG or WebP under 2 MB.");
    const path = `uploads/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
    const t = await createClient().storage.from("recording-thumbnails").upload(path, file, { contentType: file.type, upsert: false });
    if (t.error) return setUpload("The thumbnail didn't upload. Try again.");
    setThumb(path);
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="host_ref" value={hostRef} />
      <input type="hidden" name="duration_seconds" value={duration || ""} />
      <input type="hidden" name="thumbnail_path" value={thumb} />

      <fieldset className="rounded-xl border border-border/80 p-4">
        <legend className="px-1 text-sm font-semibold text-card-foreground">1. Video</legend>
        <label className={label}>{hostRef ? "Replace the video (MP4, up to 50 MB)" : "Video (MP4, up to 50 MB)"}
          <input type="file" accept="video/mp4" onChange={(e) => onVideo(e.target.files?.[0])} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium" />
        </label>
        <label className={`${label} mt-3`}>Thumbnail (optional; otherwise taken from the video)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onThumb(e.target.files?.[0])} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium" />
        </label>
        {upload ? <p role="status" className="mt-2 text-sm text-muted-foreground">{upload}</p> : hostRef ? <p className="mt-2 text-sm text-muted-foreground">Video uploaded ({Math.round(duration / 60)} min).</p> : null}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border/80 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-card-foreground">2. About it</legend>
        <label className={`${label} sm:col-span-2`}>Title<input name="title" required defaultValue={values.title} maxLength={160} className={field} /></label>
        <label className={label}>Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            <option value="lecture">Lecture</option><option value="session">Recorded session</option><option value="short">Short explainer</option>
          </select>
        </label>
        <label className={label}>Presenter<input name="presenter" defaultValue={values.presenter} maxLength={120} className={field} /></label>
        <label className={label}>Date recorded<input type="date" name="recorded_on" defaultValue={values.recorded_on} className={field} /></label>
        <label className={label}>Web address (optional)<input name="slug" defaultValue={values.slug} placeholder="made from the title" maxLength={80} className={field} /></label>
        <label className={`${label} sm:col-span-2`}>Short description<textarea name="description" rows={2} defaultValue={values.description} maxLength={600} className={field} /></label>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border/80 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-card-foreground">3. Tags</legend>
        <label className={label}>RENR domain
          <select name="domain_id" defaultValue={values.domain_id ?? ""} className={field}>
            <option value="">None</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className={label}>Taxonomy level
          <select name="cognitive_level" defaultValue={values.cognitive_level ?? ""} className={field}>
            <option value="">None</option><option value="knowledge">Knowledge / comprehension</option><option value="application">Application</option><option value="analysis">Analysis</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <p className={label}>Topic reviews it belongs to</p>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {reviews.map((r) => (
              <label key={r.slug} className="flex items-center gap-2 text-sm text-card-foreground">
                <input type="checkbox" name="reviews" value={r.slug} defaultChecked={values.reviews?.includes(r.slug)} className="accent-[hsl(var(--primary))]" />{r.title}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border/80 p-4">
        <legend className="px-1 text-sm font-semibold text-card-foreground">4. Chapters, notes and transcript</legend>
        <label className={label}>Chapters: one per line, a time then the title
          <textarea name="chapters" rows={5} defaultValue={values.chapters} placeholder={"0:00 Introduction\n1:45 Normal values\n12:30 Worked example"} className={`${field} font-mono`} />
        </label>
        <label className={label}>Notes (the written summary students see)
          <textarea name="notes" rows={6} defaultValue={values.notes} className={field} />
        </label>
        <label className={label}>Transcript: one line per sentence, a time then the words (used for captions too)
          <textarea name="transcript" rows={6} defaultValue={values.transcript} placeholder={"0:00 Welcome to this lecture.\n0:04 Today we look at..."} className={`${field} font-mono`} />
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border/80 p-4">
        <legend className="px-1 text-sm font-semibold text-card-foreground">5. Access</legend>
        <label className="flex items-center gap-2 text-sm text-card-foreground"><input type="checkbox" name="free_sample" defaultChecked={values.free_sample} className="accent-[hsl(var(--primary))]" />Free sample: free students can watch it too</label>
        {kind === "session" ? (
          <label className="flex items-start gap-2 text-sm text-card-foreground"><input type="checkbox" name="consent_confirmed" defaultChecked={values.consent_confirmed} className="mt-1 accent-[hsl(var(--primary))]" />Everyone in this recorded session agreed to it being shared, or it has been edited so that no student can be identified</label>
        ) : <input type="hidden" name="consent_confirmed" value={values.consent_confirmed ? "on" : ""} />}
        <label className={label}>Status
          <select name="status" defaultValue={values.status ?? "draft"} className={`${field} max-w-xs`}>
            <option value="draft">Draft (staff only)</option><option value="published">Published</option>
          </select>
        </label>
      </fieldset>

      {state?.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
      <Save />
    </form>
  );
}
