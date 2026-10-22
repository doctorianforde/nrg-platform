// Free-tier limits (20261022120000), against STAGING only. Turns tier_config.limits_live on for the run and puts the
// starting value back afterwards. Throwaway users and everything they create are deleted in `finally`.
//   node scripts/test-free-tier.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: token ?? SR, Authorization: `Bearer ${token ?? SR}` };
  if (token && token !== ANON) headers.apikey = ANON;
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = prefer ?? "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const short = (r) => `status=${r.status}${r.status >= 400 ? ` ${JSON.stringify(r.data).slice(0, 110)}` : ""}`;
const rpc = (fn, token, body = {}) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
const refusedFreeTier = (r) => r.status >= 400 && /paid plan|free practice limit/.test(JSON.stringify(r.data));
const setCfg = (key, value) => call(`/rest/v1/tier_config?key=eq.${key}`, { method: "PATCH", body: { value } });

const users = [], cleanup = { sets: [], groups: [] };
async function createUser(role, tier, tag) {
  const email = `tier-${tag}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${tag}: ${u.status}`);
  const x = { uid: u.data.id }; users.push(x);
  await call(`/rest/v1/profiles?id=eq.${x.uid}`, { method: "PATCH", body: { role, subscription_tier: tier, show_badges: false } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  x.token = t.data.access_token; return x;
}

const startLive = (await call("/rest/v1/tier_config?key=eq.limits_live&select=value")).data?.[0]?.value;
if (startLive === undefined) throw new Error("tier_config missing: apply 20261022120000 first");
try {
  const free = await createUser("student", "free", "free"), paid = await createUser("student", "premium", "paid"),
    teacher = await createUser("teacher", "free", "teacher");
  const qs = (await call("/rest/v1/questions?select=id&is_active=eq.true&context=eq.standalone&limit=12")).data;
  if (qs.length < 12) throw new Error("need 12 live standalone questions on staging");

  // ---- limits off: nobody is limited ----
  await setCfg("limits_live", 0);
  let r = await rpc("practice_allowance", free.token);
  check("limits off: free student not limited", r.status === 200 && r.data.limited === false, JSON.stringify(r.data));
  r = await rpc("claim_practice_reveal", free.token, { p_question: qs[11].id });
  check("limits off: claim allowed and not recorded", r.data?.allowed === true && r.data?.limited === false, JSON.stringify(r.data));

  // ---- limits on ----
  await setCfg("limits_live", 1);
  r = await rpc("practice_allowance", free.token);
  check("free: limited, 10 left, no mocks", r.data?.limited === true && r.data.remaining === 10 && r.data.mock_exams === false, JSON.stringify(r.data));
  r = await rpc("practice_allowance", paid.token);
  check("premium student: not limited", r.data?.limited === false, JSON.stringify(r.data));
  r = await rpc("practice_allowance", teacher.token);
  check("teacher on the free tier: not limited (staff)", r.data?.limited === false, JSON.stringify(r.data));
  r = await rpc("practice_allowance", ANON);
  check("anon cannot call practice_allowance", r.status === 401 || r.status === 403 || r.status === 404, short(r));

  const claims = [];
  for (let i = 0; i < 10; i++) claims.push((await rpc("claim_practice_reveal", free.token, { p_question: qs[i].id })).data);
  check("free: 10 claims allowed, remaining counts down to 0", claims.every((c) => c?.allowed) && claims[9].remaining === 0,
    claims.map((c) => c?.remaining).join(","));
  r = await rpc("claim_practice_reveal", free.token, { p_question: qs[10].id });
  check("free: 11th question refused", r.data?.allowed === false && r.data.remaining === 0, JSON.stringify(r.data));
  r = await rpc("claim_practice_reveal", free.token, { p_question: qs[3].id });
  check("free: re-checking a question already revealed today is allowed", r.data?.allowed === true, JSON.stringify(r.data));
  r = await call(`/rest/v1/practice_reveals?select=question_id&user_id=eq.${free.uid}`, { token: free.token });
  check("free: reads own reveals (10 rows, no double count)", r.status === 200 && r.data.length === 10, short(r));
  r = await call(`/rest/v1/practice_reveals?select=question_id&user_id=eq.${free.uid}`, { token: paid.token });
  check("another student cannot read them", r.status === 200 && r.data.length === 0, short(r));
  r = await call("/rest/v1/practice_reveals", { method: "POST", token: free.token, body: { user_id: free.uid, day: "2026-01-01", question_id: qs[11].id } });
  check("refused: student writes practice_reveals directly", r.status === 401 || r.status === 403, short(r));
  r = await call("/rest/v1/tier_config?key=eq.limits_live&select=key", { method: "PATCH", token: free.token, body: { value: 0 } });
  check("refused: student switches limits off", r.status >= 400 || (Array.isArray(r.data) && r.data.length === 0), short(r));

  // XP path (ranking v2): revealed answers record; an unrevealed one is refused.
  const optFor = async (q) => (await call(`/rest/v1/question_options?select=id&question_id=eq.${q}&limit=1`)).data[0].id;
  r = await rpc("record_practice_answers", free.token, { p_answers: await Promise.all(qs.slice(0, 10).map(async (q) => ({ question_id: q.id, option_ids: [await optFor(q.id)] }))) });
  check("free: recording the 10 revealed answers works", r.status === 200, short(r));
  r = await rpc("record_practice_answers", free.token, { p_answers: [{ question_id: qs[10].id, option_ids: [await optFor(qs[10].id)] }] });
  check("free: recording an unrevealed answer is refused", refusedFreeTier(r), short(r));
  r = await rpc("record_practice_answers", paid.token, { p_answers: [{ question_id: qs[10].id, option_ids: [await optFor(qs[10].id)] }] });
  check("premium: records without any reveal", r.status === 200, short(r));

  // ---- mock exams ----
  r = await call("/rest/v1/mock_exam_sets?select=id", { method: "POST", token: teacher.token, body: { title: "Free-tier test set", created_by: teacher.uid } });
  const set = r.data?.[0]?.id; if (set) cleanup.sets.push(set);
  await call("/rest/v1/mock_exam_set_questions", { method: "POST", token: teacher.token, body: [{ set_id: set, question_id: qs[0].id, display_order: 1 }], prefer: "return=minimal" });
  r = await call("/rest/v1/mock_exam_sessions?select=id", { method: "POST", token: free.token, body: { student_id: free.uid, set_id: set } });
  check("free: starting a mock exam is refused", refusedFreeTier(r), short(r));
  r = await rpc("create_exam_group", free.token, { p_set_id: set, p_name: "free group" });
  if (r.data?.id) cleanup.groups.push(r.data.id);
  check("free: creating a group exam is refused", refusedFreeTier(r), short(r));
  r = await rpc("create_exam_group", paid.token, { p_set_id: set, p_name: "paid group" });
  const grp = r.data; if (grp?.id) cleanup.groups.push(grp.id);
  check("premium: creates a group exam", r.status === 200 && !!grp?.join_code, short(r));
  r = await rpc("join_exam_group", free.token, { p_code: grp?.join_code });
  check("free: joining a paid student's group is refused", refusedFreeTier(r), short(r));
  r = await rpc("assign_exam_group", teacher.token, { p_set_id: set, p_student_ids: [free.uid, paid.uid], p_name: "assigned" });
  if (r.data?.id) cleanup.groups.push(r.data.id);
  check("teacher assigning a free student to a group is refused", refusedFreeTier(r), short(r));
  r = await call("/rest/v1/mock_exam_sessions?select=id", { method: "POST", token: paid.token, body: { student_id: paid.uid, set_id: set } });
  check("premium: starts a mock exam", r.status === 201, short(r));

  // ---- Jade's knobs ----
  await setCfg("free_mock_exams", 1);
  r = await call("/rest/v1/mock_exam_sessions?select=id", { method: "POST", token: free.token, body: { student_id: free.uid, set_id: set } });
  check("free_mock_exams = 1: free student may start a mock", r.status === 201, short(r));
  await setCfg("free_mock_exams", 0);
  await setCfg("free_practice_per_day", 12);
  r = await rpc("claim_practice_reveal", free.token, { p_question: qs[10].id });
  check("raising the daily limit to 12 frees one more question", r.data?.allowed === true && r.data.remaining === 1, JSON.stringify(r.data));
  await setCfg("free_practice_per_day", 10);

  // ---- upgrade ----
  await call(`/rest/v1/profiles?id=eq.${free.uid}`, { method: "PATCH", body: { subscription_tier: "standard" } });
  r = await rpc("practice_allowance", free.token);
  check("after upgrade to standard: not limited", r.data?.limited === false, JSON.stringify(r.data));
  r = await rpc("claim_practice_reveal", free.token, { p_question: qs[11].id });
  check("after upgrade: past-limit question allowed", r.data?.allowed === true, JSON.stringify(r.data));
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  await setCfg("limits_live", startLive);
  await setCfg("free_mock_exams", 0);
  await setCfg("free_practice_per_day", 10);
  const back = (await call("/rest/v1/tier_config?key=eq.limits_live&select=value")).data?.[0]?.value;
  console.log(`\nlimits_live restored to ${back} (was ${startLive})`);
  for (const g of cleanup.groups) { await call(`/rest/v1/mock_exam_sessions?group_id=eq.${g}`, { method: "DELETE" }); await call(`/rest/v1/exam_group_members?group_id=eq.${g}`, { method: "DELETE" }); await call(`/rest/v1/exam_groups?id=eq.${g}`, { method: "DELETE" }); }
  for (const id of cleanup.sets) { await call(`/rest/v1/mock_exam_sessions?set_id=eq.${id}`, { method: "DELETE" }); await call(`/rest/v1/mock_exam_set_questions?set_id=eq.${id}`, { method: "DELETE" }); await call(`/rest/v1/mock_exam_sets?id=eq.${id}`, { method: "DELETE" }); }
  for (const u of users) {
    const d = await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
    if (d.status >= 300) console.error(`CLEANUP WARNING: user ${u.uid} not deleted (status ${d.status}) ${JSON.stringify(d.data).slice(0, 120)}`);
  }
  const left = (await call(`/rest/v1/profiles?select=id&id=in.(${users.map((u) => u.uid).join(",")})`)).data ?? [];
  console.log(left.length ? `CLEANUP WARNING: ${left.length} test profiles left` : "cleanup: throwaway users and their rows deleted");
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed || left.length) process.exitCode = 1;
}
