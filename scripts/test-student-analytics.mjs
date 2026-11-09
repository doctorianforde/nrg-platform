// Student analytics (20261109120000, D8 option 2), against STAGING only. Creates throwaway users, a throwaway mock set,
// and deletes them all at the end.
//   node scripts/test-student-analytics.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push({ pass: !!p }); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = prefer ?? "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const rpc = (fn, token, body = {}) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
const SET_TITLE = `Analytics test set ${randomBytes(3).toString("hex")}`;

const users = [];
async function createUser(role = "student") {
  const email = `analytics-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create user: ${u.status}`);
  const x = { uid: u.data.id }; users.push(x);
  await call(`/rest/v1/profiles?id=eq.${x.uid}`, { method: "PATCH", body: { role, subscription_tier: "premium", show_badges: false } });
  x.token = (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON })).data.access_token;
  return x;
}

try {
  let r = await call("/rest/v1/rpc/my_study_analytics", { method: "POST", token: ANON, body: {} });
  check("anon cannot call my_study_analytics", r.status >= 400, `status=${r.status}`);

  const a = await createUser(), b = await createUser();
  r = await rpc("my_study_analytics", a.token);
  const doms = (await call("/rest/v1/domains?select=id")).data;
  check("a new student: nothing answered, every domain listed as New", r.status === 200 && r.data.answered === 0 && r.data.domains.length === doms.length && r.data.domains.every((d) => d.state === "new"), `status=${r.status} answered=${r.data?.answered}`);
  check("thresholds come from the ranking config", r.data?.thresholds?.min_answers > 0 && r.data?.thresholds?.window > 0, JSON.stringify(r.data?.thresholds));

  // Practice: 12 in domain 1 (3 right), 12 in domain 2 (11 right).
  const qs = async (domain) => (await call(`/rest/v1/questions?select=id,domain_id,cognitive_level,topic_id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&domain_id=eq.${domain}&order=id&limit=12`)).data;
  const d1 = await qs(1), d2 = await qs(2);
  if (d1.length < 12 || d2.length < 12) throw new Error("staging needs 12 live questions in domains 1 and 2");
  const right = (q) => q.question_options.filter((o) => o.is_correct).map((o) => o.id);
  const wrong = (q) => [q.question_options.find((o) => !o.is_correct).id];
  const answers = [...d1.map((q, i) => ({ question_id: q.id, option_ids: i < 3 ? right(q) : wrong(q) })), ...d2.map((q, i) => ({ question_id: q.id, option_ids: i < 11 ? right(q) : wrong(q) }))];
  r = await rpc("record_practice_answers", a.token, { p_answers: answers });
  check("practice answers recorded", r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);

  const an = (await rpc("my_study_analytics", a.token)).data;
  const D1 = an.domains.find((d) => d.id === 1), D2 = an.domains.find((d) => d.id === 2);
  check("totals: 24 answered, 14 correct, all practice", an.answered === 24 && an.correct === 14 && an.by_source.practice === 24, JSON.stringify({ n: an.answered, c: an.correct, s: an.by_source }));
  check("domain 1: 12 answered, 3 right, state Weak (25% <= 30%)", D1.answered === 12 && D1.correct === 3 && D1.state === "weak", JSON.stringify(D1));
  check("domain 2: 12 answered, 11 right, state Mastered (92% >= 75%)", D2.answered === 12 && D2.correct === 11 && D2.state === "mastered", JSON.stringify(D2));
  check("untouched domains stay New with 0 answered", an.domains.filter((d) => d.id > 2).every((d) => d.state === "new" && d.answered === 0));
  const all = [...d1, ...d2];
  const expTax = {}; all.forEach((q, i) => { if (!q.cognitive_level) return; const ok = i < 3 || (i >= 12 && i < 23); expTax[q.cognitive_level] = expTax[q.cognitive_level] ?? [0, 0]; expTax[q.cognitive_level][0]++; if (ok) expTax[q.cognitive_level][1]++; });
  const gotTax = Object.fromEntries(an.taxonomy.map((t) => [t.level, [t.answered, t.correct]]));
  check("taxonomy counts match the questions' levels", JSON.stringify(Object.keys(expTax).sort().map((k) => [k, expTax[k]])) === JSON.stringify(Object.keys(gotTax).sort().map((k) => [k, gotTax[k]])), JSON.stringify(gotTax));
  const qTotal = an.questions.reduce((s, [, n]) => s + n, 0), qRight = an.questions.reduce((s, [, , c]) => s + c, 0);
  check("per-question counts: 24 questions, add up to 24 answered / 14 correct", an.questions.length === 24 && qTotal === 24 && qRight === 14, `${an.questions.length} q, ${qTotal}/${qRight}`);
  check("topics_touched counts distinct topics", an.topics_touched === new Set(all.map((q) => q.topic_id).filter(Boolean)).size, `${an.topics_touched}`);
  check("activity: today has 24 answers", an.activity.length === 1 && an.activity[0].answered === 24 && an.activity[0].day === an.today, JSON.stringify(an.activity));

  r = await rpc("my_study_analytics", b.token);
  check("another student sees only their own (nothing)", r.data.answered === 0 && r.data.questions.length === 0, `answered=${r.data.answered}`);

  // Mock: unreleased answers are withheld, released ones count.
  const teacher = await createUser("teacher");
  const mq = (await call(`/rest/v1/questions?select=id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&domain_id=eq.3&order=id&limit=10`)).data;
  const set = (await call("/rest/v1/mock_exam_sets", { method: "POST", body: { title: SET_TITLE, created_by: teacher.uid, is_active: true } })).data[0];
  await call("/rest/v1/mock_exam_set_questions", { method: "POST", prefer: "return=minimal", body: mq.map((q, i) => ({ set_id: set.id, question_id: q.id, display_order: i + 1 })) });
  const sess = (await call("/rest/v1/mock_exam_sessions", { method: "POST", body: { student_id: a.uid, set_id: set.id } })).data[0];
  await call("/rest/v1/mock_exam_responses", { method: "POST", prefer: "return=minimal", body: mq.map((q) => ({ session_id: sess.id, question_id: q.id, selected_option_ids: right(q) })) });
  r = await rpc("complete_mock_exam_session", a.token, { p_session_id: sess.id });
  check("mock completed", r.status < 300, `status=${r.status}`);
  const mockRows = (await call(`/rest/v1/question_attempts?select=id&user_id=eq.${a.uid}&source=eq.mock`)).data.length;
  let m = (await rpc("my_study_analytics", a.token)).data;
  check("before release: mock answers withheld, not counted", mockRows === mq.length && m.withheld_mock_answers === mq.length && m.answered === 24 && !m.by_source.mock, JSON.stringify({ rows: mockRows, withheld: m.withheld_mock_answers, n: m.answered }));
  check("before release: domain 3 shows nothing", m.domains.find((d) => d.id === 3).answered === 0);
  await call(`/rest/v1/mock_exam_sets?id=eq.${set.id}`, { method: "PATCH", body: { rationale_released_at: new Date().toISOString(), rationale_released_by: teacher.uid } });
  m = (await rpc("my_study_analytics", a.token)).data;
  check("after release: mock answers count", m.withheld_mock_answers === 0 && m.answered === 24 + mq.length && m.by_source.mock === mq.length && m.domains.find((d) => d.id === 3).answered === mq.length, JSON.stringify({ withheld: m.withheld_mock_answers, n: m.answered, s: m.by_source }));

  r = await rpc("my_study_analytics", teacher.token);
  check("a teacher calling it gets only their own (empty) analytics", r.status === 200 && r.data.answered === 0, `answered=${r.data?.answered}`);
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  // Users first (their mock sessions cascade), then every set this suite has made, including any a crashed run left.
  for (const u of users) await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
  await call(`/rest/v1/mock_exam_sets?title=like.${encodeURIComponent("Analytics test set *")}`, { method: "DELETE" });
  if (users.length) {
    const ids = users.map((u) => u.uid).join(",");
    const left = [
      ...((await call(`/rest/v1/question_attempts?select=id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/practice_sessions?select=id&student_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/mock_exam_sets?select=id&title=like.${encodeURIComponent("Analytics test set *")}`)).data ?? []),
    ];
    check("cleanup: test users' data and the test set removed", left.length === 0, `rows=${left.length}`);
  }
  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
