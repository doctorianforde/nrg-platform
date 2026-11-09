// Uploads the sample recordings made by make-sample-recording.mjs to STAGING and publishes them.
//   node scripts/upload-sample-recordings.mjs <dir with <slug>.mp4, <slug>-thumb.jpg, <slug>.meta.json>
// Reads each script in docs/phase-1/sample-recordings/. Re-running replaces the files and the rows (by slug).
// Patient demographics is a free sample; ABG is for paid plans, so both access paths can be tested.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: upload-sample-recordings.mjs <dir>");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");
const H = { apikey: SR, Authorization: `Bearer ${SR}` };
const rest = async (p, method = "GET", body, prefer = "return=representation") => {
  const r = await fetch(`${SB}/rest/v1/${p}`, { method, headers: { ...H, "Content-Type": "application/json", Prefer: prefer }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${t}`); return t ? JSON.parse(t) : null;
};
const put = async (bucket, key, file, type) => {
  const r = await fetch(`${SB}/storage/v1/object/${bucket}/${key}`, { method: "POST", headers: { ...H, "Content-Type": type, "x-upsert": "true" }, body: readFileSync(file) });
  if (!r.ok) throw new Error(`upload ${bucket}/${key}: ${r.status} ${await r.text()}`);
};
const FREE = new Set(["patient-demographics"]);
const domains = await rest("domains?select=id,code");
const scriptsDir = new URL("../docs/phase-1/sample-recordings/", import.meta.url);

for (const f of readdirSync(scriptsDir).filter((x) => x.endsWith(".json"))) {
  const spec = JSON.parse(readFileSync(new URL(f, scriptsDir), "utf8"));
  const meta = JSON.parse(readFileSync(path.join(dir, `${spec.slug}.meta.json`), "utf8"));
  await put("recordings", `samples/${spec.slug}.mp4`, path.join(dir, `${spec.slug}.mp4`), "video/mp4");
  await put("recording-thumbnails", `samples/${spec.slug}.jpg`, path.join(dir, `${spec.slug}-thumb.jpg`), "image/jpeg");
  const row = {
    slug: spec.slug, title: spec.title, kind: spec.kind, presenter: spec.presenter, recorded_on: new Date().toISOString().slice(0, 10),
    description: spec.description, notes: spec.notes, transcript: meta.transcript, thumbnail_path: `samples/${spec.slug}.jpg`,
    duration_seconds: meta.duration_seconds, host: "supabase", host_ref: `samples/${spec.slug}.mp4`, status: "published",
    free_sample: FREE.has(spec.slug), consent_confirmed: true, domain_id: domains.find((d) => d.code === spec.domain_code)?.id ?? null,
    cognitive_level: spec.cognitive_level, published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const [rec] = await rest("recordings?on_conflict=slug", "POST", row, "return=representation,resolution=merge-duplicates");
  await rest(`recording_chapters?recording_id=eq.${rec.id}`, "DELETE", null, "return=minimal");
  await rest("recording_chapters", "POST", meta.chapters.map((c, i) => ({ recording_id: rec.id, position: i, start_seconds: c.start, title: c.title })), "return=minimal");
  await rest(`recording_links?recording_id=eq.${rec.id}`, "DELETE", null, "return=minimal");
  if (spec.reviews?.length) await rest("recording_links", "POST", spec.reviews.map((s) => ({ recording_id: rec.id, review_slug: s })), "return=minimal");
  console.log(`published ${spec.slug} (${meta.duration_seconds}s, ${meta.chapters.length} chapters, ${FREE.has(spec.slug) ? "free sample" : "paid plans"})`);
}
