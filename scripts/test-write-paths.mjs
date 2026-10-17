// Smoke test of every write the app makes with a USER token (not the service role), against STAGING only, plus a few
// writes that must now be refused by privilege (20261017120000_revoke_unneeded_grants). Throwaway users and everything
// they create are deleted in `finally`.
//   node scripts/test-write-paths.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (new URL(SB).hostname !== "kwhaqhhwqykckarjbdod.supabase.co") throw new Error("refusing: not the staging project");

const results = []; const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, prefer, raw, contentType } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = contentType ?? "application/json"; headers.Prefer = prefer ?? "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const short = (r) => `status=${r.status}${r.status >= 400 ? ` ${JSON.stringify(r.data).slice(0, 100)}` : ""}`;
const one = (r) => r.status < 300 && Array.isArray(r.data) && r.data.length === 1;

const users = [], cleanup = { questions: [], sets: [], groups: [], events: [] };
async function createUser(role, tag) {
  const email = `writes-${tag}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${tag}: ${u.status}`);
  const x = { uid: u.data.id }; users.push(x);
  await call(`/rest/v1/profiles?id=eq.${x.uid}`, { method: "PATCH", body: { role, subscription_tier: "premium", show_badges: false } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  x.token = t.data.access_token; return x;
}

try {
  const s = await createUser("student", "s1"), s2 = await createUser("student", "s2"), t = await createUser("teacher", "t");

  // ---- profile edit, badge privacy, avatar ----
  let r = await call(`/rest/v1/profiles?id=eq.${s.uid}&select=id,full_name`, { method: "PATCH", token: s.token, body: { full_name: "Write Path Student" } });
  check("profile edit (full_name)", one(r) && r.data[0].full_name === "Write Path Student", short(r));
  r = await call(`/rest/v1/profiles?id=eq.${s.uid}&select=id`, { method: "PATCH", token: s.token, body: { show_badges: false } });
  check("show-badges toggle", one(r), short(r));
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  r = await call(`/storage/v1/object/avatars/${s.uid}/avatar.jpg`, { method: "POST", token: s.token, raw: jpeg, contentType: "image/jpeg", prefer: "" });
  check("avatar upload (storage)", r.status === 200, short(r));
  r = await call(`/rest/v1/profiles?id=eq.${s.uid}&select=id`, { method: "PATCH", token: s.token, body: { avatar_url: `${SB}/storage/v1/object/public/avatars/${s.uid}/avatar.jpg?v=1` } });
  check("avatar url saved on profile", one(r), short(r));
  r = await call(`/storage/v1/object/avatars`, { method: "DELETE", token: s.token, body: { prefixes: [`${s.uid}/avatar.jpg`] }, prefer: "" });
  check("avatar remove (storage)", r.status === 200, short(r));

  // ---- calendar ----
  r = await call("/rest/v1/calendar_events?select=id", { method: "POST", token: t.token, body: { title: "Write-path test", event_date: "2026-12-01", audience: "selected", created_by: t.uid } });
  const ev = r.data?.[0]?.id; if (ev) cleanup.events.push(ev);
  check("calendar: teacher creates event", r.status === 201 && !!ev, short(r));
  r = await call("/rest/v1/calendar_event_audience", { method: "POST", token: t.token, body: [{ event_id: ev, user_id: s.uid }], prefer: "return=minimal" });
  check("calendar: audience insert", r.status === 201, short(r));
  r = await call(`/rest/v1/calendar_events?id=eq.${ev}&select=id`, { method: "PATCH", token: t.token, body: { title: "Write-path test (edited)" } });
  check("calendar: event update", one(r), short(r));
  r = await call(`/rest/v1/calendar_event_audience?event_id=eq.${ev}&select=user_id`, { method: "DELETE", token: t.token });
  check("calendar: audience delete", one(r), short(r));
  r = await call("/rest/v1/calendar_events?select=id", { method: "POST", token: s.token, body: { title: "Student own", event_date: "2026-12-02", audience: "self", created_by: s.uid } });
  if (r.data?.[0]?.id) cleanup.events.push(r.data[0].id);
  check("calendar: student creates own event", r.status === 201, short(r));
  r = await call(`/rest/v1/calendar_events?id=eq.${ev}&select=id`, { method: "DELETE", token: t.token });
  check("calendar: event delete", one(r), short(r));

  // ---- messaging ----
  r = await call("/rest/v1/message_threads?select=id", { method: "POST", token: s.token, body: { student_id: s.uid, subject: "Write-path thread" } });
  const th = r.data?.[0]?.id;
  check("messages: student starts a thread", r.status === 201 && !!th, short(r));
  r = await call("/rest/v1/messages", { method: "POST", token: s.token, body: { thread_id: th, author_id: s.uid, body: "hello" }, prefer: "return=minimal" });
  check("messages: student posts", r.status === 201, short(r));
  r = await call("/rest/v1/messages", { method: "POST", token: t.token, body: { thread_id: th, author_id: t.uid, body: "reply" }, prefer: "return=minimal" });
  check("messages: teacher replies", r.status === 201, short(r));
  r = await call("/rest/v1/rpc/mark_thread_read", { method: "POST", token: s.token, body: { p_thread_id: th } });
  check("messages: mark read (rpc)", r.status < 300, short(r));
  r = await call("/rest/v1/message_threads?select=id", { method: "POST", token: t.token, body: { student_id: s.uid, subject: "Staff-started thread" } });
  check("messages: teacher starts a thread with a student", r.status === 201, short(r));

  // ---- student question submission → teacher review approve ----
  const domainId = (await call("/rest/v1/domains?select=id&order=display_order&limit=1")).data[0].id;
  r = await call("/rest/v1/questions?select=id", { method: "POST", token: s.token, body: { body: "Write-path submitted question?", explanation: "because", domain_id: domainId,
    question_type: "mcq", source: "student-submission", is_ai_generated: false, is_active: false, review_status: "pending", created_by: s.uid } });
  const sq = r.data?.[0]?.id; if (sq) cleanup.questions.push(sq);
  check("student submits a question", r.status === 201 && !!sq, short(r));
  r = await call("/rest/v1/question_options?select=id", { method: "POST", token: s.token, body: ["A", "B", "C", "D"].map((b, i) => ({ question_id: sq, body: `Option ${b}`, is_correct: i === 0, display_order: i + 1 })) });
  check("student submits its options", r.status === 201 && r.data?.length === 4, short(r));
  const opts = r.data ?? [];
  const cur = (await call(`/rest/v1/questions?id=eq.${sq}&select=updated_at`)).data[0];
  const ro = await Promise.all(opts.map((o, i) => call(`/rest/v1/question_options?id=eq.${o.id}&question_id=eq.${sq}&select=id`, { method: "PATCH", token: t.token, body: { body: `Option ${i}`, rationale: null, is_correct: i === 1 } })));
  check("teacher review: edit options + key", ro.every(one), ro.map((x) => x.status).join(","));
  r = await call(`/rest/v1/questions?id=eq.${sq}&updated_at=eq.${encodeURIComponent(cur.updated_at)}&select=id`, { method: "PATCH", token: t.token,
    body: { body: "Write-path submitted question (edited)?", explanation: "edited", review_notes: null, review_status: "approved", is_active: true, reviewed_by: t.uid, reviewed_at: new Date().toISOString() } });
  check("teacher review: approve", one(r), short(r));
  const xp = (await call(`/rest/v1/xp_events?select=reason&user_id=eq.${s.uid}`)).data ?? [];
  check("approval awards the student's question XP (definer path)", xp.length >= 1, JSON.stringify(xp));

  // ---- mock exam: teacher builds a set, student sits it, group exam ----
  const someQ = (await call("/rest/v1/questions?select=id&is_active=eq.true&context=eq.standalone&limit=2")).data;
  r = await call("/rest/v1/mock_exam_sets?select=id", { method: "POST", token: t.token, body: { title: "Write-path set", created_by: t.uid, duration_minutes: 30 } });
  const set = r.data?.[0]?.id; if (set) cleanup.sets.push(set);
  check("mock: teacher creates a set", r.status === 201 && !!set, short(r));
  r = await call("/rest/v1/mock_exam_set_questions", { method: "POST", token: t.token, body: someQ.map((q, i) => ({ set_id: set, question_id: q.id, display_order: i + 1 })), prefer: "return=minimal" });
  check("mock: teacher adds questions", r.status === 201, short(r));
  r = await call(`/rest/v1/mock_exam_sets?id=eq.${set}&select=id`, { method: "PATCH", token: t.token, body: { duration_minutes: 45 } });
  check("mock: teacher edits duration", one(r), short(r));
  r = await call("/rest/v1/mock_exam_sessions?select=id", { method: "POST", token: s.token, body: { student_id: s.uid, set_id: set } });
  const sess = r.data?.[0]?.id;
  check("mock: student starts a session", r.status === 201 && !!sess, short(r));
  const optIds = (await call(`/rest/v1/question_options?select=id&question_id=eq.${someQ[0].id}`)).data.map((o) => o.id);
  for (const [label, pick] of [["answer", optIds[0]], ["change answer (upsert update)", optIds[1]]]) {
    r = await call("/rest/v1/mock_exam_responses?on_conflict=session_id,question_id", { method: "POST", token: s.token, prefer: "resolution=merge-duplicates,return=minimal",
      body: { session_id: sess, question_id: someQ[0].id, selected_option_ids: [pick], answered_at: new Date().toISOString() } });
    check(`mock: student ${label}`, r.status === 201 || r.status === 200, short(r));
  }
  r = await call("/rest/v1/rpc/complete_mock_exam_session", { method: "POST", token: s.token, body: { p_session_id: sess } });
  check("mock: student finishes (rpc)", r.status === 200 && r.data?.completed_at, short(r));
  r = await call(`/rest/v1/mock_exam_sets?id=eq.${set}&select=id`, { method: "PATCH", token: t.token, body: { rationale_released_at: new Date().toISOString() } });
  check("mock: teacher releases rationales", one(r), short(r));
  r = await call("/rest/v1/rpc/create_exam_group", { method: "POST", token: s.token, body: { p_set_id: set, p_name: "Write-path group" } });
  const grp = r.data; if (grp?.id) cleanup.groups.push(grp.id);
  check("group: student creates a group (rpc)", r.status === 200 && !!grp?.join_code, short(r));
  r = await call("/rest/v1/rpc/join_exam_group", { method: "POST", token: s2.token, body: { p_code: grp?.join_code } });
  check("group: classmate joins by code (rpc)", r.status === 200, short(r));
  r = await call("/rest/v1/rpc/leave_exam_group", { method: "POST", token: s2.token, body: { p_group: grp?.id } });
  check("group: classmate leaves (rpc)", r.status < 300, short(r));
  r = await call(`/rest/v1/mock_exam_set_questions?set_id=eq.${set}&question_id=eq.${someQ[1].id}&select=question_id`, { method: "DELETE", token: t.token });
  check("mock: teacher removes a question", one(r), short(r));

  // ---- now refused by privilege, not just by RLS ----
  r = await call("/rest/v1/question_attempts", { method: "POST", token: s.token, body: { user_id: s.uid, question_id: someQ[0].id, option_ids: [], is_correct: true, source: "practice" } });
  check("refused: student inserts a question_attempt", r.status === 401 || r.status === 403, short(r));
  r = await call(`/rest/v1/exam_groups?id=eq.${grp?.id}`, { method: "PATCH", token: s.token, body: { max_members: 50 } });
  check("refused: student edits an exam group directly", r.status === 401 || r.status === 403, short(r));
  r = await call(`/rest/v1/profiles?id=eq.${s.uid}`, { method: "DELETE", token: s.token });
  check("refused: student deletes own profile row", r.status === 401 || r.status === 403, short(r));
  r = await call("/rest/v1/profiles", { method: "POST", token: ANON, body: { id: s.uid, role: "admin" } });
  check("refused: anon inserts a profile", r.status === 401 || r.status === 403, short(r));
  r = await call("/rest/v1/_backup_review_options_20261005?select=*&limit=1", { token: s.token });
  check("refused: student reads an answer-key snapshot table", r.status === 401 || r.status === 403 || (r.status === 404), short(r));
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  // Shared rows the throwaway users created (FKs without cascade), then the users (cascades the rest).
  for (const g of cleanup.groups) { await call(`/rest/v1/mock_exam_sessions?group_id=eq.${g}`, { method: "DELETE" }); await call(`/rest/v1/exam_group_members?group_id=eq.${g}`, { method: "DELETE" }); await call(`/rest/v1/exam_groups?id=eq.${g}`, { method: "DELETE" }); }
  for (const id of cleanup.sets) { await call(`/rest/v1/mock_exam_sessions?set_id=eq.${id}`, { method: "DELETE" }); await call(`/rest/v1/mock_exam_set_questions?set_id=eq.${id}`, { method: "DELETE" }); await call(`/rest/v1/mock_exam_sets?id=eq.${id}`, { method: "DELETE" }); }
  for (const id of cleanup.questions) { await call(`/rest/v1/question_options?question_id=eq.${id}`, { method: "DELETE" }); await call(`/rest/v1/questions?id=eq.${id}`, { method: "DELETE" }); }
  for (const id of cleanup.events) await call(`/rest/v1/calendar_events?id=eq.${id}`, { method: "DELETE" });
  for (const u of users) {
    await call(`/storage/v1/object/avatars`, { method: "DELETE", body: { prefixes: [`${u.uid}/avatar.jpg`] }, prefer: "" });
    const d = await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
    if (d.status >= 300) console.error(`CLEANUP WARNING: user ${u.uid} not deleted (status ${d.status}) ${JSON.stringify(d.data).slice(0, 120)}`);
  }
  const left = (await call(`/rest/v1/profiles?select=id&id=in.(${users.map((u) => u.uid).join(",")})`)).data ?? [];
  console.log(left.length ? `CLEANUP WARNING: ${left.length} test profiles left` : "\ncleanup: throwaway users and their rows deleted");
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed || left.length) process.exitCode = 1;
}
