// Shared-account signals (20261109160000), against STAGING only. Throwaway users; the thresholds are restored at the end.
//   node scripts/test-sharing-signals.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, ua } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") headers["Content-Type"] = "application/json";
  if (ua) headers["User-Agent"] = ua;
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const rpc = (fn, token, body = {}) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/131.0",
];

const users = [];
async function createUser(role) {
  const email = `sharing-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${role}: ${u.status}`);
  users.push(u.data.id);
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role } });
  // A sign-in through our login page: sign in, then end the other sessions.
  const signIn = async (ua) => {
    const t = (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON, ua })).data;
    if (role === "student") await rpc("end_other_sessions", t.access_token);
    return t;
  };
  return { uid: u.data.id, email, signIn };
}
const cfg = async () => Object.fromEntries(((await call("/rest/v1/account_guard_config?select=key,value")).data ?? []).map((r) => [r.key, Number(r.value)]));
const start = await cfg();

try {
  check("thresholds seeded at 5 sign-outs a day and 4 browsers a week", start.bumps_per_day === 5 && start.devices_per_week === 4, JSON.stringify(start));
  const admin = await createUser("admin"), teacher = await createUser("teacher"), s = await createUser("student"), quiet = await createUser("student");
  const at = await admin.signIn(), tt = await teacher.signIn();

  let st;
  for (let i = 0; i < 6; i++) { st = await s.signIn(UAS[i % UAS.length]); await sleep(1100); }
  const q1 = await quiet.signIn(UAS[0]);
  await rpc("session_is_current", q1.access_token); // a normal page load records the sign-in

  let r = await rpc("shared_account_signals", st.access_token);
  check("a student cannot read the signals", r.status >= 400, `status=${r.status}`);
  r = await rpc("shared_account_signals", tt.access_token);
  check("a teacher cannot read the signals", r.status >= 400, `status=${r.status}`);
  r = await rpc("shared_account_signals", at.access_token);
  check("an admin can read the signals", r.status === 200 && Array.isArray(r.data?.students), `status=${r.status}`);
  const find = (data, id) => data.students.find((x) => x.user_id === id);
  let row = find(r.data, s.uid);
  check("6 sign-ins in a row: 5 sign-outs today", row?.max_bumps_day === 5 && row?.bumps_today === 5, JSON.stringify({ max: row?.max_bumps_day, today: row?.bumps_today }));
  check("4 different browsers in 7 days", row?.devices_7d === 4, `${row?.devices_7d}`);
  check("so the student is flagged, and listed first", row?.flagged === true && r.data.students[0].user_id === s.uid);
  check("recent sign-ins carry the browser string", row?.recent?.length >= 4 && row.recent.some((x) => (x.user_agent ?? "").includes("iPhone")), `${row?.recent?.length}`);
  check("staff never appear in the list", !find(r.data, admin.uid) && !find(r.data, teacher.uid));
  const qrow = find(r.data, quiet.uid);
  check("a normal student is listed but not flagged", qrow && qrow.flagged === false && qrow.sign_ins_7d === 1, JSON.stringify(qrow && { f: qrow.flagged, n: qrow.sign_ins_7d }));

  r = await rpc("mark_sharing_reviewed", tt.access_token, { p_user: s.uid, p_note: "x" });
  check("a teacher cannot mark a review", r.status >= 400, `status=${r.status}`);
  r = await rpc("mark_sharing_reviewed", at.access_token, { p_user: s.uid, p_note: "Spoke to the student: new phone" });
  check("an admin marks it reviewed", r.status < 300, `status=${r.status}`);
  row = find((await rpc("shared_account_signals", at.access_token)).data, s.uid);
  check("after review: counts restart, not flagged, note kept", row.flagged === false && row.max_bumps_day === 0 && row.devices_7d === 0 && row.review_note === "Spoke to the student: new phone", JSON.stringify({ f: row.flagged, b: row.max_bumps_day, d: row.devices_7d }));

  r = await rpc("set_account_guard_config", tt.access_token, { p_key: "bumps_per_day", p_value: 1 });
  check("a teacher cannot change the thresholds", r.status >= 400, `status=${r.status}`);
  r = await rpc("set_account_guard_config", at.access_token, { p_key: "bumps_per_day", p_value: 0 });
  check("a threshold of 0 is refused", r.status >= 400, `status=${r.status}`);
  r = await rpc("set_account_guard_config", at.access_token, { p_key: "bumps_per_day", p_value: 1 });
  check("an admin sets sign-outs per day to 1", r.status < 300, `status=${r.status}`);
  await sleep(1100);
  await s.signIn(UAS[0]);
  row = find((await rpc("shared_account_signals", at.access_token)).data, s.uid);
  check("one new sign-out after the review flags them again at threshold 1", row.flagged === true && row.max_bumps_day === 1, JSON.stringify({ f: row.flagged, b: row.max_bumps_day }));
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  results.push(false);
} finally {
  for (const [k, v] of Object.entries(start)) await call(`/rest/v1/account_guard_config?key=eq.${k}`, { method: "PATCH", body: { value: v } });
  const end = await cfg();
  check("thresholds restored", end.bumps_per_day === start.bumps_per_day && end.devices_per_week === start.devices_per_week, JSON.stringify(end));
  for (const id of users) await call(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  if (users.length) {
    const ids = users.join(",");
    const left = [
      ...((await call(`/rest/v1/student_sign_ins?select=session_id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/student_session_bumps?select=session_id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/sharing_reviews?select=user_id&user_id=in.(${ids})`)).data ?? []),
    ];
    check("cleanup: sign-ins, bumps and reviews removed with the users", left.length === 0, `rows=${left.length}`);
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
