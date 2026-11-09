// Instructor analytics (20261109220000 class_analytics()), against STAGING only. Creates throwaway students with
// answers and a mock placed in time so each at-risk rule fires (or doesn't), checks who may call the function, and
// deletes everything at the end.   node scripts/test-instructor-analytics.mjs
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
const users = [], sessions = [];
async function createUser(role, { tier = "premium", joinedDaysAgo = 0 } = {}) {
  const email = `cls-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  users.push(u.data.id);
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: tier, created_at: new Date(Date.now() - joinedDaysAgo * 864e5).toISOString() } });
  const t = (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: "anon" })).data;
  return { uid: u.data.id, email, token: t.access_token };
}
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
let QS = [];
/** n answers for a student, `correct` of them right, spread between `fromDays` and `toDays` ago. */
async function answers(uid, n, correct, fromDays, toDays) {
  const rows = Array.from({ length: n }, (_, i) => {
    const q = QS[i % QS.length];
    return { user_id: uid, question_id: q.id, domain_id: q.domain_id, option_ids: [], is_correct: i < correct, source: "practice",
      answered_at: ago(fromDays + ((toDays - fromDays) * i) / Math.max(1, n - 1)) };
  });
  const r = await call("/rest/v1/question_attempts", { method: "POST", body: rows, prefer: "return=minimal" });
  if (r.status >= 300) throw new Error(`insert answers: ${r.status} ${JSON.stringify(r.data)}`);
}

try {
  QS = (await call("/rest/v1/questions?select=id,domain_id&is_active=eq.true&review_status=eq.approved&limit=60")).data ?? [];
  if (QS.length < 10) throw new Error("need approved questions on staging");
  const set = (await call("/rest/v1/mock_exam_sets?select=id,title&limit=1")).data?.[0];
  if (!set) throw new Error("need a mock exam set on staging");

  const inactive = await createUser("student", { joinedDaysAgo: 30 });
  await answers(inactive.uid, 25, 22, 12, 10);
  const never = await createUser("student", { joinedDaysAgo: 10 });
  const fresh = await createUser("student", { joinedDaysAgo: 1 });
  const low = await createUser("student", { joinedDaysAgo: 20 });
  await answers(low.uid, 30, 10, 2, 0);
  const few = await createUser("student", { joinedDaysAgo: 20 });
  await answers(few.uid, 10, 1, 1, 0); // 10% but under the 20-answer minimum
  const mock = await createUser("student", { joinedDaysAgo: 20 });
  await answers(mock.uid, 25, 20, 1, 0);
  const ms = await call("/rest/v1/mock_exam_sessions", { method: "POST", body: { student_id: mock.uid, set_id: set.id, started_at: ago(1.1), completed_at: ago(1), score_pct: 55, total_questions: 20, correct_count: 11 } });
  if (ms.status >= 300) throw new Error(`insert mock: ${ms.status} ${JSON.stringify(ms.data)}`);
  sessions.push(ms.data[0].id);
  const drop = await createUser("student", { joinedDaysAgo: 40 });
  await answers(drop.uid, 20, 19, 27, 15);
  await answers(drop.uid, 20, 12, 6, 0);
  const ok = await createUser("student", { joinedDaysAgo: 40 });
  await answers(ok.uid, 25, 20, 3, 0);
  const passedMock = await createUser("student", { joinedDaysAgo: 20 });
  await answers(passedMock.uid, 25, 20, 1, 0);
  const pm = await call("/rest/v1/mock_exam_sessions", { method: "POST", body: { student_id: passedMock.uid, set_id: set.id, started_at: ago(1.1), completed_at: ago(1), score_pct: 85, total_questions: 20, correct_count: 17 } });
  sessions.push(pm.data?.[0]?.id);
  const teacher = await createUser("teacher");

  // Who may call it
  let r = await rpc("class_analytics", "anon");
  check("signed-out visitors can't call it", r.status >= 400, `status=${r.status}`);
  r = await rpc("class_analytics", ok.token);
  check("a student can't call it", r.status >= 400, `status=${r.status}`);
  r = await rpc("class_analytics", teacher.token);
  check("a teacher can", r.status === 200 && Array.isArray(r.data?.students), `status=${r.status}`);
  const a = r.data;
  const by = (u) => a.students.find((s) => s.id === u.uid);
  const reasons = (u) => by(u)?.reasons ?? null;

  check("thresholds come back from the config", a.thresholds.inactive_days == 7 && a.thresholds.low_pct == 50 && a.thresholds.drop_points == 15 && a.thresholds.recent_answers == 50, JSON.stringify(a.thresholds));
  check("the unconfirmed settings are listed", a.thresholds.unconfirmed.includes("mock_pass_pct"), JSON.stringify(a.thresholds.unconfirmed));
  check("teachers aren't listed as students", !by(teacher));
  check("10 days without an answer = inactive", JSON.stringify(reasons(inactive)) === '["inactive"]', JSON.stringify(reasons(inactive)));
  check("joined 10 days ago, never answered = inactive", JSON.stringify(reasons(never)) === '["inactive"]', JSON.stringify(reasons(never)));
  check("joined yesterday, no answers yet = not flagged", JSON.stringify(reasons(fresh)) === "[]", JSON.stringify(reasons(fresh)));
  check("33% over 30 answers = low accuracy", JSON.stringify(reasons(low)) === '["low"]', JSON.stringify(reasons(low)));
  check("10% over only 10 answers = not flagged yet (under the minimum)", JSON.stringify(reasons(few)) === "[]", JSON.stringify(reasons(few)));
  check("latest mock 55% yesterday = mock below pass", JSON.stringify(reasons(mock)) === '["mock"]', JSON.stringify(reasons(mock)));
  check("latest mock 85% = not flagged", JSON.stringify(reasons(passedMock)) === "[]", JSON.stringify(reasons(passedMock)));
  check("95% then 60% across fortnights = dropping", JSON.stringify(reasons(drop)) === '["drop"]', JSON.stringify({ r: reasons(drop), p: by(drop)?.prev_fortnight, t: by(drop)?.this_fortnight }));
  check("steady 80% = on track", JSON.stringify(reasons(ok)) === "[]", JSON.stringify(reasons(ok)));
  check("last mock details come back", by(mock)?.last_mock?.pct == 55 && by(mock)?.last_mock?.title === set.title, JSON.stringify(by(mock)?.last_mock));
  check("recent accuracy counts the last answers", by(low)?.recent_answered === 30 && by(low)?.recent_correct === 10);
  check("12 weeks of trends", a.weeks.length === 12, `${a.weeks.length}`);
  const lastTwo = a.weeks.slice(-2); // the test mocks were finished "yesterday", which may be last week
  check("the latest weeks count our active students and the mocks", lastTwo[1].active >= 5 && lastTwo[0].mocks + lastTwo[1].mocks >= 2, JSON.stringify(lastTwo));
  check("domains report class accuracy", a.domains.length > 0 && a.domains.reduce((s, d) => s + d.answered, 0) >= 150, `${a.domains.reduce((s, d) => s + d.answered, 0)}`);
  check("at-risk students sort first", a.students.findIndex((s) => s.reasons.length === 0) > a.students.findLastIndex((s) => s.reasons.length > 0) || a.students.every((s) => s.reasons.length > 0));
  globalThis.__ids = { teacherEmail: teacher.email };
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  results.push(false);
} finally {
  for (const id of sessions.filter(Boolean)) await call(`/rest/v1/mock_exam_sessions?id=eq.${id}`, { method: "DELETE" });
  if (users.length) await call(`/rest/v1/question_attempts?user_id=in.(${users.join(",")})`, { method: "DELETE" });
  for (const id of users) await call(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  const left = users.length ? ((await call(`/rest/v1/question_attempts?select=id&user_id=in.(${users.join(",")})`)).data ?? []).length : 0;
  check("cleanup: students, answers and mocks removed", left === 0, `rows=${left}`);
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
