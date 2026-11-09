import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/DashboardShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtLength, KIND_LABEL, type RecordingKind } from "@/lib/recordings/queries";
import { RecordingForm, type RecordingFormValues } from "./RecordingForm";

export const dynamic = "force-dynamic";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Teacher → Recordings (2026-11-09): every recording with its status, and the add / edit form (?edit=<id> or ?new). */
export default async function TeacherRecordingsPage({ searchParams }: { searchParams: { edit?: string; new?: string; saved?: string } }) {
  const { user, profile } = await requireRole("teacher", "/teacher/recordings");
  const supabase = createClient();
  const [{ data: recs, error }, { data: domains }, { data: reviews }] = await Promise.all([
    supabase.from("recordings").select("id, slug, title, kind, status, free_sample, duration_seconds, published_at, updated_at").order("updated_at", { ascending: false }),
    supabase.from("domains").select("id, name").order("display_order"),
    supabase.from("topic_reviews").select("slug, title").order("sort_order"),
  ]);
  const { data: views } = await supabase.from("recording_progress").select("recording_id, watched_at");

  let values: RecordingFormValues | null = searchParams.new !== undefined ? {} : null;
  if (searchParams.edit) {
    const [{ data: r }, { data: ch }, { data: ln }] = await Promise.all([
      supabase.from("recordings").select("*").eq("id", searchParams.edit).maybeSingle(),
      supabase.from("recording_chapters").select("start_seconds, title").eq("recording_id", searchParams.edit).order("position"),
      supabase.from("recording_links").select("review_slug").eq("recording_id", searchParams.edit),
    ]);
    if (r) {
      values = {
        id: r.id, slug: r.slug, title: r.title, kind: r.kind, presenter: r.presenter ?? "", recorded_on: r.recorded_on ?? "",
        description: r.description ?? "", notes: r.notes ?? "", thumbnail_path: r.thumbnail_path ?? "", duration_seconds: r.duration_seconds,
        host_ref: r.host_ref, status: r.status, free_sample: r.free_sample, consent_confirmed: r.consent_confirmed, domain_id: r.domain_id,
        cognitive_level: r.cognitive_level, reviews: (ln ?? []).map((l) => l.review_slug),
        chapters: (ch ?? []).map((c) => `${clock(c.start_seconds)} ${c.title}`).join("\n"),
        transcript: ((r.transcript as { t: number; text: string }[] | null) ?? []).map((l) => `${clock(l.t)} ${l.text}`).join("\n"),
      };
    }
  }

  return (
    <DashboardShell profile={profile} email={user.email} title="Recordings" eyebrow="Teaching" subtitle="Add past recordings and lectures, tag them to topics, and publish them for students.">
      {error ? (
        <EmptyState title="Recordings aren't available yet" body="This environment needs the recordings database update." />
      ) : values ? (
        <Card className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle>{values.id ? `Edit: ${values.title}` : "Add a recording"}</CardTitle>
            <Link href="/teacher/recordings" className="text-sm font-medium text-brand-700 underline">Back to the list</Link>
          </div>
          <RecordingForm values={values} domains={domains ?? []} reviews={reviews ?? []} />
        </Card>
      ) : (
        <>
          {searchParams.saved ? <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">Saved “{searchParams.saved.slice(0, 160)}”.</p> : null}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{(recs ?? []).length} recordings · <Link href="/study/recordings" className="text-brand-700 underline">See the student library</Link></p>
            <Link href="/teacher/recordings?new" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover">Add a recording</Link>
          </div>
          {(recs ?? []).length === 0 ? <EmptyState title="No recordings yet" body="Add the first one with the button above." /> : (
            <Card className="p-0">
              <ul className="divide-y divide-border/70">
                {(recs ?? []).map((r) => {
                  const v = (views ?? []).filter((x) => x.recording_id === r.id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-card-foreground">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{KIND_LABEL[r.kind as RecordingKind]} · {fmtLength(r.duration_seconds)} · {v.length} started, {v.filter((x) => x.watched_at).length} watched</p>
                      </div>
                      <Badge tone={r.status === "published" ? "green" : "amber"} dot>{r.status === "published" ? "Published" : "Draft"}</Badge>
                      {r.free_sample ? <Badge tone="blue">Free sample</Badge> : null}
                      <Link href={`/study/recordings/${r.slug}`} className="text-sm font-medium text-brand-700 underline">Watch</Link>
                      <Link href={`/teacher/recordings?edit=${r.id}`} className="text-sm font-medium text-brand-700 underline">Edit</Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </DashboardShell>
  );
}
