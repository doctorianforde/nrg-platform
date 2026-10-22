// Topic reviews (20261022140000), against STAGING only: who reads drafts, who publishes, what the database stamps, and
// that the practice candidates follow the same visibility. Publishes one review for the run and puts every review's
// status back afterwards. Throwaway users are deleted in `finally`.
//   node scripts/test-topic-reviews.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const short = (r) => `status=${r.status}${r.status >= 400 ? ` ${JSON.stringify(r.data).slice(0, 110)}` : ""}`;

const users = [];
async function createUser(role, tag) {
  const email = `review-${tag}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${tag}: ${u.status}`);
  const x = { uid: u.data.id }; users.push(x);
  await call(`/rest/v1/profiles?id=eq.${x.uid}`, { method: "PATCH", body: { role, subscription_tier: "premium", show_badges: false } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } , token: ANON });
  x.token = t.data.access_token; return x;
}

const before = (await call("/rest/v1/topic_reviews?select=slug,status")).data;
if (!Array.isArray(before) || before.length === 0) throw new Error("no topic_reviews: apply 20261022140000 and run the importer first");
const SLUG = "endocrine"; // has live questions on staging
try {
  await call("/rest/v1/topic_reviews?status=eq.published", { method: "PATCH", body: { status: "draft" } });
  const student = await createUser("student", "s"), teacher = await createUser("teacher", "t");

  let r = await call("/rest/v1/topic_reviews?select=slug", { token: student.token });
  check("student sees no drafts", r.status === 200 && r.data.length === 0, `${r.data?.length} rows`);
  r = await call("/rest/v1/topic_reviews?select=slug", { token: teacher.token });
  check("teacher sees every draft", r.status === 200 && r.data.length === before.length, `${r.data?.length} of ${before.length}`);
  r = await call("/rest/v1/topic_reviews?select=slug", { token: ANON });
  check("anon sees nothing", r.status === 401 || (r.status === 200 && r.data.length === 0), short(r));
  r = await call("/rest/v1/rpc/topic_review_candidates", { method: "POST", token: student.token, body: { p_slug: SLUG } });
  check("student gets no practice candidates for a draft", r.status === 200 && r.data.length === 0, `${r.data?.length} rows`);

  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}&select=slug`, { method: "PATCH", token: student.token, body: { status: "published" } });
  check("student cannot publish", r.status >= 400 || (Array.isArray(r.data) && r.data.length === 0), short(r));
  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}&select=slug`, { method: "PATCH", token: teacher.token, body: { title: "Changed" } });
  check("teacher cannot edit content (status only)", r.status === 401 || r.status === 403, short(r));
  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}&select=slug`, { method: "PATCH", token: teacher.token, body: { status: "published", published_by: student.uid } });
  check("teacher cannot set published_by", r.status === 401 || r.status === 403, short(r));
  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}&select=slug,status`, { method: "PATCH", token: teacher.token, body: { status: "published" } });
  check("teacher publishes", r.status === 200 && r.data?.[0]?.status === "published", short(r));
  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}&select=published_by,published_at`);
  check("database stamps who published and when", r.data?.[0]?.published_by === teacher.uid && !!r.data[0].published_at, JSON.stringify(r.data?.[0]));

  r = await call("/rest/v1/topic_reviews?select=slug,slides,question", { token: student.token });
  check("student now sees exactly the published one, with its content", r.data?.length === 1 && r.data[0].slug === SLUG && r.data[0].slides.length === 8 && !!r.data[0].question, `${r.data?.length} rows`);
  r = await call("/rest/v1/rpc/topic_review_candidates", { method: "POST", token: student.token, body: { p_slug: SLUG } });
  check("student gets practice candidates once published", r.status === 200 && r.data.length > 0, `${r.data?.length} rows`);
  const ids = (r.data ?? []).map((q) => q.id);
  const live = ids.length ? (await call(`/rest/v1/questions?select=id&is_active=eq.true&context=eq.standalone&id=in.(${ids.join(",")})`)).data : [];
  check("every candidate is a live standalone question", live.length === ids.length, `${live.length}/${ids.length}`);
  r = await call("/rest/v1/rpc/topic_review_candidates", { method: "POST", token: ANON, body: { p_slug: SLUG } });
  check("anon cannot call the candidates function", r.status === 401 || r.status === 403 || r.status === 404, short(r));

  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}&select=status,published_by`, { method: "PATCH", token: teacher.token, body: { status: "draft" } });
  check("teacher unpublishes; stamp cleared", r.data?.[0]?.status === "draft" && r.data[0].published_by === null, short(r));
  r = await call("/rest/v1/topic_reviews?select=slug", { token: student.token });
  check("student no longer sees it", r.data?.length === 0, `${r.data?.length} rows`);
  r = await call("/rest/v1/topic_reviews", { method: "POST", token: teacher.token, body: { slug: "x-test", title: "x", system: "x", slides: [] } });
  check("teacher cannot insert a review", r.status === 401 || r.status === 403, short(r));
  r = await call(`/rest/v1/topic_reviews?slug=eq.${SLUG}`, { method: "DELETE", token: teacher.token });
  check("teacher cannot delete a review", r.status === 401 || r.status === 403, short(r));
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  for (const b of before) await call(`/rest/v1/topic_reviews?slug=eq.${b.slug}`, { method: "PATCH", body: { status: b.status } });
  const after = (await call("/rest/v1/topic_reviews?select=slug,status")).data ?? [];
  const same = before.every((b) => after.find((a) => a.slug === b.slug)?.status === b.status);
  console.log(`\nreview statuses restored: ${same ? "yes" : "NO"}`);
  for (const u of users) {
    const d = await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
    if (d.status >= 300) console.error(`CLEANUP WARNING: user ${u.uid} not deleted (status ${d.status})`);
  }
  const left = users.length ? (await call(`/rest/v1/profiles?select=id&id=in.(${users.map((u) => u.uid).join(",")})`)).data ?? [] : [];
  console.log(left.length ? `CLEANUP WARNING: ${left.length} test profiles left` : "cleanup: throwaway users deleted");
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed || left.length || !same) process.exitCode = 1;
}
