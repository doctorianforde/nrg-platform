// Topic-review reading XP and the free tier's daily review (20261022160000), against STAGING only. Publishes two
// reviews and turns tier_config.limits_live on for the run, then puts both back. Time is simulated by moving
// topic_review_opens.opened_at back with the service role. Throwaway users are deleted in `finally`.
//   node scripts/test-topic-review-reading.mjs
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
const rpc = (fn, token, body = {}) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
const j = (r) => JSON.stringify(r.data).slice(0, 140);
const users = [];
async function createUser(role, tier, tag) {
  const email = `rread-${tag}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${tag}: ${u.status}`);
  const x = { uid: u.data.id }; users.push(x);
  await call(`/rest/v1/profiles?id=eq.${x.uid}`, { method: "PATCH", body: { role, subscription_tier: tier, show_badges: false } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  x.token = t.data.access_token; return x;
}
const backdate = async (uid, slug, minutes) => {
  const id = (await call(`/rest/v1/topic_reviews?slug=eq.${slug}&select=id`)).data[0].id;
  return call(`/rest/v1/topic_review_opens?user_id=eq.${uid}&review_id=eq.${id}`, { method: "PATCH", body: { opened_at: new Date(Date.now() - minutes * 60000).toISOString() } });
};
const content = async (token, slug) => (await call(`/rest/v1/topic_reviews?slug=eq.${slug}&select=slug,slides`, { token })).data?.length ?? -1;

const before = (await call("/rest/v1/topic_reviews?select=slug,status")).data;
const liveBefore = (await call("/rest/v1/tier_config?key=eq.limits_live&select=value")).data?.[0]?.value;
const rulesLive = Number((await call("/rest/v1/ranking_config?key=eq.rules_live&select=value")).data?.[0]?.value) === 1;
if (!Array.isArray(before) || liveBefore === undefined) throw new Error("apply 20261022140000 + 20261022160000 and import the reviews first");
const A = "endocrine", B = "renal";
try {
  await call("/rest/v1/topic_reviews?status=eq.published", { method: "PATCH", body: { status: "draft" } });
  await call(`/rest/v1/topic_reviews?slug=in.(${A},${B})`, { method: "PATCH", body: { status: "published" } });
  await call("/rest/v1/tier_config?key=eq.limits_live", { method: "PATCH", body: { value: 1 } });
  const paid = await createUser("student", "premium", "paid"), free = await createUser("student", "free", "free"), teacher = await createUser("teacher", "free", "t");

  // ---- reading XP (premium student) ----
  let r = await rpc("topic_review_list", paid.token);
  check("list: the two published reviews", r.data?.length === 2, j(r));
  r = await rpc("complete_topic_review", paid.token, { p_slug: A });
  check("complete before opening → not_open", r.data?.status === "not_open", j(r));
  r = await rpc("open_topic_review", paid.token, { p_slug: A });
  check("premium opens (no limit)", r.data?.allowed === true && !!r.data.opened_at, j(r));
  r = await rpc("complete_topic_review", paid.token, { p_slug: A });
  check("complete straight away → early, ~180 s left", r.data?.status === "early" && r.data.seconds_left > 170, j(r));
  await backdate(paid.uid, A, 4);
  r = await rpc("complete_topic_review", paid.token, { p_slug: A });
  check(`after 4 minutes → read, ${rulesLive ? "30 XP paid" : "shadow (0 paid)"}`, r.data?.status === "read" && r.data.xp === (rulesLive ? 30 : 0), j(r));
  const ev = (await call(`/rest/v1/xp_events?user_id=eq.${paid.uid}&reason=eq.topic_review&select=amount`)).data ?? [];
  const sh = (await call(`/rest/v1/xp_shadow?user_id=eq.${paid.uid}&kind=eq.topic_review&select=new_amount`)).data ?? [];
  check("ledger matches the rules mode", rulesLive ? ev.length === 1 && ev[0].amount === 30 : sh.length === 1 && sh[0].new_amount === 30, `events ${JSON.stringify(ev)} shadow ${JSON.stringify(sh)}`);
  r = await rpc("complete_topic_review", paid.token, { p_slug: A });
  check("second completion → already, nothing paid twice", r.data?.status === "already", j(r));
  const ev2 = (await call(`/rest/v1/xp_events?user_id=eq.${paid.uid}&reason=eq.topic_review&select=amount`)).data ?? [];
  check("still one XP event", ev2.length === (rulesLive ? 1 : 0), `${ev2.length}`);
  r = await rpc("topic_review_access", paid.token, { p_slug: A });
  check("access reports read", r.data?.read === true && r.data.limited === false, j(r));
  check("premium reads content of both", (await content(paid.token, A)) === 1 && (await content(paid.token, B)) === 1);

  // ---- free tier ----
  r = await rpc("topic_review_list", free.token);
  check("free: list still shows both titles", r.data?.length === 2, j(r));
  check("free: content locked before opening", (await content(free.token, A)) === 0 && (await content(free.token, B)) === 0);
  r = await rpc("topic_review_candidates", free.token, { p_slug: A });
  check("free: no practice candidates while locked", r.data?.length === 0, j(r));
  r = await rpc("topic_review_access", free.token, { p_slug: A });
  check("free: access says limited, quota left", r.data?.limited === true && r.data.quota_left === true && r.data.minutes === 5, j(r));
  r = await rpc("open_topic_review", free.token, { p_slug: A });
  check("free: opens today's review", r.data?.allowed === true, j(r));
  check("free: that review's content unlocks, the other stays locked", (await content(free.token, A)) === 1 && (await content(free.token, B)) === 0);
  r = await rpc("topic_review_access", free.token, { p_slug: A });
  check("free: access gives an expiry ~5 minutes out", r.data?.expires_at && Math.abs(Date.parse(r.data.expires_at) - Date.now() - 5 * 60000) < 60000, j(r));
  r = await rpc("open_topic_review", free.token, { p_slug: B });
  check("free: a second review the same day is refused (quota)", r.data?.allowed === false && r.data.reason === "quota", j(r));
  r = await rpc("open_topic_review", free.token, { p_slug: A });
  check("free: re-opening the same review is allowed", r.data?.allowed === true, j(r));
  await backdate(free.uid, A, 6);
  check("free: after 5 minutes the content locks again", (await content(free.token, A)) === 0);
  r = await rpc("open_topic_review", free.token, { p_slug: A });
  check("free: re-opening after the window → time", r.data?.allowed === false && r.data.reason === "time", j(r));
  r = await rpc("complete_topic_review", free.token, { p_slug: A });
  check("free: a review read within the day still counts", r.data?.status === "read", j(r));

  // ---- staff, switches, refusals ----
  r = await rpc("open_topic_review", teacher.token, { p_slug: A });
  check("teacher: open allowed, not recorded", r.data?.allowed === true && ((await call(`/rest/v1/topic_review_opens?user_id=eq.${teacher.uid}&select=day`)).data ?? []).length === 0, j(r));
  r = await rpc("complete_topic_review", teacher.token, { p_slug: A });
  check("teacher: no reading XP", r.data?.status === "staff", j(r));
  check("teacher: reads drafts too", (await content(teacher.token, "heart-failure")) === 1);
  await call("/rest/v1/tier_config?key=eq.limits_live", { method: "PATCH", body: { value: 0 } });
  check("limits off: free student reads every published review", (await content(free.token, A)) === 1 && (await content(free.token, B)) === 1);
  check("limits off: drafts still hidden from students", (await content(free.token, "heart-failure")) === 0);
  r = await rpc("topic_review_list", ANON);
  check("anon cannot list", r.status === 401 || r.status === 403, `${r.status}`);
  r = await call("/rest/v1/topic_review_opens", { method: "POST", token: free.token, body: { user_id: free.uid, review_id: (await call(`/rest/v1/topic_reviews?slug=eq.${B}&select=id`)).data[0].id, day: "2026-10-22" } });
  check("student cannot write opens directly", r.status === 401 || r.status === 403, `${r.status}`);
  r = await call("/rest/v1/topic_review_reads", { method: "POST", token: free.token, body: { user_id: free.uid, review_id: (await call(`/rest/v1/topic_reviews?slug=eq.${B}&select=id`)).data[0].id } });
  check("student cannot write reads directly", r.status === 401 || r.status === 403, `${r.status}`);
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  await call("/rest/v1/tier_config?key=eq.limits_live", { method: "PATCH", body: { value: liveBefore } });
  for (const b of before) await call(`/rest/v1/topic_reviews?slug=eq.${b.slug}`, { method: "PATCH", body: { status: b.status } });
  const after = (await call("/rest/v1/topic_reviews?select=slug,status")).data ?? [];
  const same = before.every((b) => after.find((a) => a.slug === b.slug)?.status === b.status);
  const live = (await call("/rest/v1/tier_config?key=eq.limits_live&select=value")).data?.[0]?.value;
  console.log(`\nreview statuses restored: ${same ? "yes" : "NO"}; limits_live ${live} (was ${liveBefore})`);
  for (const u of users) {
    const d = await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
    if (d.status >= 300) console.error(`CLEANUP WARNING: user ${u.uid} not deleted (status ${d.status})`);
  }
  const left = users.length ? (await call(`/rest/v1/profiles?select=id&id=in.(${users.map((u) => u.uid).join(",")})`)).data ?? [] : [];
  console.log(left.length ? `CLEANUP WARNING: ${left.length} test profiles left` : "cleanup: throwaway users deleted");
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed || left.length || !same) process.exitCode = 1;
}
