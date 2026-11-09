// Recordings library (20261109200000), against STAGING only. Needs the two published samples
// (scripts/upload-sample-recordings.mjs): patient-demographics (free sample) and abg-interpretation (paid plans).
// Creates throwaway users and a throwaway draft; deletes them at the end.   node scripts/test-recordings.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token === "anon" ? ANON : token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = prefer ?? "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const rpc = (fn, token, body = {}) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
const users = [];
async function createUser(role, tier = "free") {
  const email = `rec-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  users.push(u.data.id);
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: tier } });
  const t = (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: "anon" })).data;
  return { uid: u.data.id, token: t.access_token };
}
let draftId = null;

try {
  const recs = (await call("/rest/v1/recordings?select=id,slug,duration_seconds,free_sample,host_ref")).data ?? [];
  const free = recs.find((r) => r.slug === "patient-demographics"), paidRec = recs.find((r) => r.slug === "abg-interpretation");
  if (!free || !paidRec) throw new Error("publish the two samples first (scripts/upload-sample-recordings.mjs)");
  const fs = await createUser("student"), ps = await createUser("student", "premium"), t = await createUser("teacher");

  let r = await call("/rest/v1/recordings?select=id", { token: "anon" });
  check("signed-out visitors see no recordings", r.status >= 400 || (Array.isArray(r.data) && r.data.length === 0), `status=${r.status}`);
  r = await call("/rest/v1/recordings?select=slug&status=eq.published", { token: fs.token });
  check("a free student sees both published recordings in the library", r.data?.length >= 2, `${r.data?.length}`);
  r = await rpc("recording_playback_allowed", fs.token, { p_recording: free.id });
  check("a free student may play the free sample", r.data === true, JSON.stringify(r.data));
  r = await rpc("recording_playback_allowed", fs.token, { p_recording: paidRec.id });
  check("a free student may not play a paid recording", r.data === false, JSON.stringify(r.data));
  r = await rpc("recording_playback_allowed", ps.token, { p_recording: paidRec.id });
  check("a paid student may play it", r.data === true, JSON.stringify(r.data));
  r = await call(`/storage/v1/object/authenticated/recordings/${paidRec.host_ref}`, { token: ps.token });
  check("even a paid student can't read the video file directly (only through a signed link)", r.status >= 400, `status=${r.status}`);

  // Drafts
  const d = await call("/rest/v1/recordings", { method: "POST", body: { slug: `test-draft-${randomBytes(3).toString("hex")}`, title: "Test draft", kind: "lecture", duration_seconds: 100, host_ref: paidRec.host_ref, status: "draft" } });
  draftId = d.data?.[0]?.id;
  r = await call(`/rest/v1/recordings?select=id&id=eq.${draftId}`, { token: ps.token });
  check("students can't see drafts", r.data?.length === 0, `${r.data?.length}`);
  r = await rpc("recording_playback_allowed", ps.token, { p_recording: draftId });
  check("students can't play drafts", r.data === false, JSON.stringify(r.data));
  r = await call(`/rest/v1/recordings?select=id&id=eq.${draftId}`, { token: t.token });
  check("teachers see drafts", r.data?.length === 1, `${r.data?.length}`);
  r = await rpc("set_recording_details", t.token, { p_recording: draftId, p_chapters: [{ start: 0, title: "Start" }, { start: 50, title: "Middle" }], p_reviews: ["copd", "no-such-review"] });
  const ch = (await call(`/rest/v1/recording_chapters?select=title&recording_id=eq.${draftId}&order=position`)).data;
  const ln = (await call(`/rest/v1/recording_links?select=review_slug&recording_id=eq.${draftId}`)).data;
  check("a teacher saves chapters and topic links (unknown reviews ignored)", r.status < 300 && ch?.length === 2 && ln?.length === 1 && ln[0].review_slug === "copd", JSON.stringify({ ch: ch?.length, ln }));
  r = await rpc("set_recording_details", ps.token, { p_recording: draftId, p_chapters: [], p_reviews: [] });
  check("a student can't change chapters", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/recordings?id=eq.${paidRec.id}`, { method: "PATCH", token: ps.token, body: { free_sample: true } });
  check("a student can't edit a recording", r.status >= 400 || (Array.isArray(r.data) && r.data.length === 0), `status=${r.status}`);
  r = await call(`/rest/v1/recordings?id=eq.${draftId}`, { method: "PATCH", token: t.token, body: { kind: "session", status: "published" } });
  check("a recorded session can't be published without consent confirmed", r.status >= 400, `status=${r.status}`);

  // Progress
  r = await rpc("save_recording_progress", fs.token, { p_recording: paidRec.id, p_position: 30 });
  check("a free student can't save progress on a paid recording", r.status >= 400, `status=${r.status}`);
  r = await rpc("save_recording_progress", fs.token, { p_recording: free.id, p_position: 40 });
  check("progress saves", r.status === 200 && r.data?.position_seconds === 40 && !r.data?.watched_at, JSON.stringify(r.data));
  r = await rpc("save_recording_progress", fs.token, { p_recording: free.id, p_position: 99999 });
  check("a position past the end is clamped and marks it watched", r.data?.position_seconds === free.duration_seconds && !!r.data?.watched_at, JSON.stringify(r.data));
  r = await rpc("save_recording_progress", fs.token, { p_recording: free.id, p_position: 10 });
  check("going back keeps the furthest point and the watched mark", r.data?.position_seconds === 10 && r.data?.furthest_seconds === free.duration_seconds && !!r.data?.watched_at, JSON.stringify(r.data));
  r = await call(`/rest/v1/recording_progress?select=user_id&user_id=eq.${fs.uid}`, { token: ps.token });
  check("another student can't see that progress", r.data?.length === 0, `${r.data?.length}`);
  r = await call("/rest/v1/recording_progress", { method: "POST", token: fs.token, body: { user_id: fs.uid, recording_id: paidRec.id, furthest_seconds: 999 } });
  check("progress can't be written directly", r.status >= 400, `status=${r.status}`);
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  results.push(false);
} finally {
  if (draftId) await call(`/rest/v1/recordings?id=eq.${draftId}`, { method: "DELETE" });
  for (const id of users) await call(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  const left = users.length ? ((await call(`/rest/v1/recording_progress?select=user_id&user_id=in.(${users.join(",")})`)).data ?? []).length : 0;
  check("cleanup: draft, users and their progress removed", left === 0, `rows=${left}`);
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
