// One device per student (20261109140000), against STAGING only. Throwaway users, deleted at the end.
//   node scripts/test-single-session.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const rpc = (fn, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body: {} });
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

const users = [];
async function createUser(role) {
  const email = `session-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${role}: ${u.status}`);
  users.push(u.data.id);
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role } });
  const signIn = async () => (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON })).data;
  return { uid: u.data.id, signIn };
}

try {
  let r = await call("/rest/v1/rpc/session_is_current", { method: "POST", token: ANON, body: {} });
  check("anon cannot call session_is_current", r.status >= 400, `status=${r.status}`);

  const s = await createUser("student");
  const a = await s.signIn();
  check("access tokens carry a session_id claim", !!claims(a.access_token).session_id, claims(a.access_token).session_id);
  r = await rpc("session_is_current", a.access_token);
  check("a student's only session is current", r.status === 200 && r.data === true, JSON.stringify(r.data));

  await new Promise((res) => setTimeout(res, 1100)); // sessions are ordered by creation time
  const b = await s.signIn();
  r = await rpc("session_is_current", a.access_token);
  check("after a second sign-in, the first device is no longer current", r.data === false, JSON.stringify(r.data));
  r = await rpc("session_is_current", b.access_token);
  check("the newest sign-in is current", r.data === true, JSON.stringify(r.data));
  await rpc("session_is_current", a.access_token);
  const bumps = (await call(`/rest/v1/student_session_bumps?select=session_id&user_id=eq.${s.uid}`)).data ?? [];
  check("the bump is logged once for the old session", bumps.length === 1 && bumps[0].session_id === claims(a.access_token).session_id, `rows=${bumps.length}`);
  r = await call(`/rest/v1/student_session_bumps?select=session_id`, { token: b.access_token });
  check("a student cannot read the bump log", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);

  // The login page's end_other_sessions(): logs the bump and ends the old session, so its refresh token stops working.
  await new Promise((res) => setTimeout(res, 1100));
  const c = await s.signIn();
  r = await rpc("end_other_sessions", c.access_token);
  check("end_other_sessions ends the student's other two sessions", r.status === 200 && r.data === 2, JSON.stringify(r.data));
  r = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", token: ANON, body: { refresh_token: b.refresh_token } });
  check("the ended device can no longer refresh its session", r.status >= 400, `status=${r.status}`);
  r = await call("/rest/v1/rpc/session_was_bumped", { method: "POST", token: ANON, body: { p_session: claims(b.access_token).session_id } });
  check("session_was_bumped (anon) is true for the ended session", r.status === 200 && r.data === true, JSON.stringify(r.data));
  r = await call("/rest/v1/rpc/session_was_bumped", { method: "POST", token: ANON, body: { p_session: crypto.randomUUID() } });
  check("session_was_bumped is false for an unknown session", r.status === 200 && r.data === false, JSON.stringify(r.data));
  r = await rpc("session_is_current", c.access_token);
  check("the newest session is still current after that", r.data === true, JSON.stringify(r.data));

  const t = await createUser("teacher");
  const t1 = await t.signIn();
  await new Promise((res) => setTimeout(res, 1100));
  const t2 = await t.signIn();
  const [x1, x2] = await Promise.all([rpc("session_is_current", t1.access_token), rpc("session_is_current", t2.access_token)]);
  check("staff may stay signed in on two devices", x1.data === true && x2.data === true, `${x1.data}/${x2.data}`);
  r = await rpc("end_other_sessions", t2.access_token);
  const t1Still = await rpc("session_is_current", t1.access_token);
  check("end_other_sessions does nothing for staff", r.data === 0 && t1Still.data === true, `${r.data}/${t1Still.data}`);
  r = await call(`/rest/v1/student_session_bumps?select=session_id&user_id=eq.${s.uid}`, { token: t2.access_token });
  check("staff can read the bump log (A by the newest-session check, B by end_other_sessions)", r.status === 200 && r.data.length === 2, `rows=${r.data?.length}`);
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  results.push(false);
} finally {
  for (const id of users) await call(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  if (users.length) {
    const left = (await call(`/rest/v1/student_session_bumps?select=session_id&user_id=in.(${users.join(",")})`)).data ?? [];
    check("cleanup: users and their bump rows removed", left.length === 0, `rows=${left.length}`);
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
