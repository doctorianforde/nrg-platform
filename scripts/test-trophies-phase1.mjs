// Trophies phase 1 gate — badge catalogue, award engine, hooks and privacy, against STAGING only.
// T34 style: throwaway users, PASS/FAIL per assertion, everything they created deleted at the end. Secrets from .env.local.
//
//   node scripts/test-trophies-phase1.mjs
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (!SB?.includes("kwhaqhhwqykckarjbdod")) throw new Error("refusing: not the staging project");

const results = [];
const check = (n, p, d = "") => { results.push(!!p); console.log(`${p ? "PASS" : "FAIL"} | ${n}${d !== "" ? ` | ${d}` : ""}`); };
async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = prefer ?? "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {} return { status: res.status, data };
}
const rpc = (fn, args = {}, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, token });
const users = [];
async function createUser(role = "student") {
  const email = `troph-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, subscription_tier: "premium" } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  const x = { uid: u.data.id, token: t.data.access_token }; users.push(x); return x;
}
const badges = async (uid) => ((await call(`/rest/v1/user_badges?select=badge_code&user_id=eq.${uid}`)).data ?? []).map((b) => b.badge_code).sort();
const has = (list, ...codes) => codes.every((c) => list.includes(c));
const keyOf = async (qid) => (await call(`/rest/v1/question_options?select=id&is_correct=eq.true&question_id=eq.${qid}`)).data.map((o) => o.id);
const cleanup = [];

try {
  const defs = (await call("/rest/v1/badge_definitions?select=code,category")).data;
  check("catalogue: 56 badges (24 rank, 5 trophies, 27 accomplishments)", defs.length === 56 &&
    defs.filter((d) => d.category === "rank").length === 24 && defs.filter((d) => d.category === "trophy").length === 5, defs.length);

  const all = (await call("/rest/v1/questions?select=id,domain_id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&order=id&limit=111")).data;
  const right = (q) => q.question_options.filter((o) => o.is_correct).map((o) => o.id);
  const wrong = (q) => [q.question_options.find((o) => !o.is_correct).id];
  const session = (u, qs, pick) => rpc("record_practice_answers", { p_answers: qs.map((q) => ({ question_id: q.id, option_ids: pick(q) })) }, u.token);
  const np = all.filter((q) => q.domain_id === 1);

  // ---- Volume: First Steps at 1, Century at 100 ----
  const v = await createUser();
  await session(v, all.slice(0, 1), right);
  check("first answer earns First Steps (and nothing for 100 yet)", has(await badges(v.uid), "first-steps") && !(await badges(v.uid)).includes("century"));
  await call("/rest/v1/question_attempts", { method: "POST", prefer: "return=minimal", body: Array.from({ length: 98 }, (_, i) => ({ user_id: v.uid, question_id: all[i % 50].id, option_ids: right(all[i % 50]), domain_id: all[i % 50].domain_id, is_correct: true, source: "practice", answered_at: new Date(Date.now() - 86400000 * 3).toISOString() })) });
  await session(v, all.slice(60, 61), right);
  check("100th answer earns Century", (await badges(v.uid)).includes("century"));

  // ---- Streak 7 (Trinidad days) ----
  const k = await createUser();
  const back = [];
  for (let day = 6; day >= 1; day--) for (let i = 0; i < 10; i++) {
    const when = new Date(Date.now() - 4 * 3600000 - day * 86400000); when.setUTCHours(18, 0, 0, 0);
    back.push({ user_id: k.uid, question_id: all[i].id, option_ids: right(all[i]), domain_id: null, is_correct: true, source: "practice", answered_at: when.toISOString() });
  }
  await call("/rest/v1/question_attempts", { method: "POST", prefer: "return=minimal", body: back });
  await session(k, all.slice(20, 30), right);
  check("7th day in a row earns On a Roll (not Committed)", (await badges(k.uid)).includes("streak-7") && !(await badges(k.uid)).includes("streak-30"));

  // ---- Mastery: Weak -> Mastered and the domain badge, once ----
  const m = await createUser();
  await session(m, np.slice(0, 10), wrong);
  check("a weak domain earns nothing", !(await badges(m.uid)).some((b) => b.startsWith("domain-") || b === "turned-it-around"));
  for (let i = 0; i < 3; i++) await session(m, np.slice(10, 20), right);
  let mb = await badges(m.uid);
  check("Weak -> Mastered earns Turned It Around and Nursing Practice Mastered", has(mb, "turned-it-around", "domain-np"), mb.join(","));
  await session(m, np.slice(20, 30), right);
  check("badges are earned once (no duplicates on later sessions)", (await call(`/rest/v1/user_badges?select=badge_code&user_id=eq.${m.uid}&badge_code=eq.domain-np`)).data.length === 1);

  // ---- Blueprint Master: all seven domains mastered ----
  const bm = await createUser();
  const seed = [];
  for (const dId of [1, 2, 3, 4, 5, 6, 7]) {
    const qs = all.filter((q) => q.domain_id === dId).slice(0, 5);
    for (let i = 0; i < 10; i++) { const q = qs[i % qs.length]; seed.push({ user_id: bm.uid, question_id: q.id, option_ids: right(q), domain_id: dId, is_correct: true, source: "practice", answered_at: new Date(Date.now() - 86400000 * 20).toISOString() }); }
  }
  await call("/rest/v1/question_attempts", { method: "POST", prefer: "return=minimal", body: seed });
  await session(bm, np.slice(25, 26), right);
  mb = await badges(bm.uid);
  check("all seven domains mastered earns Blueprint Master", mb.includes("blueprint-master") && !mb.includes("turned-it-around"), mb.join(","));

  // ---- Mock exams: First Paper, Pass Mark, Distinction, Team Player ----
  const teacher = await createUser("teacher");
  const mk = await createUser();
  const set = (await call("/rest/v1/mock_exam_sets", { method: "POST", body: { title: "Trophy test set", created_by: teacher.uid, is_active: true } })).data[0];
  cleanup.push(`/rest/v1/mock_exam_sets?id=eq.${set.id}`);
  const mq = all.slice(80, 90);
  await call("/rest/v1/mock_exam_set_questions", { method: "POST", prefer: "return=minimal", body: mq.map((q, i) => ({ set_id: set.id, question_id: q.id, display_order: i + 1 })) });
  const sitMock = async (u, pick, group) => {
    const sess = (await call("/rest/v1/mock_exam_sessions", { method: "POST", body: { student_id: u.uid, set_id: set.id, ...(group ? { group_id: group } : {}) } })).data[0];
    await call("/rest/v1/mock_exam_responses", { method: "POST", prefer: "return=minimal", body: mq.map((q) => ({ session_id: sess.id, question_id: q.id, selected_option_ids: pick(q) })) });
    return rpc("complete_mock_exam_session", { p_session_id: sess.id }, u.token);
  };
  await sitMock(mk, (q) => (mq.indexOf(q) < 5 ? right(q) : wrong(q)));   // 50%
  mb = await badges(mk.uid);
  check("a 50% mock earns First Paper only", mb.includes("first-paper") && !mb.includes("pass-mark"), mb.join(","));
  await sitMock(mk, right);                                                  // 100%
  mb = await badges(mk.uid);
  check("a 100% mock earns Pass Mark and Distinction", has(mb, "pass-mark", "distinction"), mb.join(","));
  const group = (await call("/rest/v1/exam_groups", { method: "POST", body: { set_id: set.id, created_by: teacher.uid, join_code: Array.from(randomBytes(6), (x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("") } })).data?.[0];
  if (group) { await sitMock(mk, right, group.id); check("a group mock earns Team Player", (await badges(mk.uid)).includes("team-player")); }
  else check("a group mock earns Team Player", false, "could not create an exam group");

  // ---- Promotion: rank badge, tier trophy, Flawless, First Time ----
  const p = await createUser();
  await call("/rest/v1/xp_events", { method: "POST", prefer: "return=minimal", body: { user_id: p.uid, amount: 2100, reason: "question_approved", source_id: randomUUID() } });
  await call("/rest/v1/promotion_attempts", { method: "POST", prefer: "return=minimal", body: [1, 2, 3, 4].map((lv) => ({ user_id: p.uid, target_level: lv, question_count: 25, finished_at: new Date().toISOString(), score: 20, passed: true })) });
  const attId = (await rpc("start_promotion_quiz", {}, p.token)).data;
  let cur = (await rpc("promotion_current", { p_attempt: attId }, p.token)).data;
  while (!cur.done) cur = (await rpc("promotion_answer", { p_attempt: attId, p_position: cur.position, p_option_ids: await keyOf(cur.question.id) }, p.token)).data;
  mb = await badges(p.uid);
  check("passing the level-5 quiz 25/25 earns Advanced Beginner I, the tier trophy, Flawless and First Time",
    cur.passed && has(mb, "rank-5", "trophy-advanced-beginner", "flawless", "first-time"), mb.join(","));
  check("no badges for levels promoted without a quiz", !mb.some((b) => ["rank-1", "rank-2", "rank-3", "rank-4"].includes(b)));

  // ---- Case study: Case Opened and Clinical Judgement ----
  const c = await createUser();
  const cs = (await call("/rest/v1/case_studies?select=id&case_code=eq.NRG-PD-001")).data[0];
  const att = (await call("/rest/v1/case_attempts", { method: "POST", body: { student_id: c.uid, case_study_id: cs.id, total_questions: 8, next_position: 1 } })).data[0];
  const cq = (await call(`/rest/v1/case_study_questions?select=display_order,questions(id,question_options(id,is_correct))&case_study_id=eq.${cs.id}&order=display_order`)).data;
  for (const row of cq) await rpc("answer_case_question", { p_attempt_id: att.id, p_option_id: row.questions.question_options.find((o) => o.is_correct).id }, c.token);
  mb = await badges(c.uid);
  check("completing a case with every answer right earns Case Opened and Clinical Judgement (not Caseload)",
    has(mb, "case-opened", "clinical-judgement") && !mb.includes("caseload"), mb.join(","));
  cleanup.push(`/rest/v1/case_attempts?id=eq.${att.id}`);

  // ---- Contribution: Author on approval ----
  const a = await createUser();
  const q = (await call("/rest/v1/questions", { method: "POST", body: { body: "Trophy test question: which action comes first when a client reports chest pain?", domain_id: 1, question_type: "mcq", source: "student-submission", is_ai_generated: false, is_active: false, review_status: "pending", created_by: a.uid } })).data[0];
  cleanup.push(`/rest/v1/questions?id=eq.${q.id}`);
  check("a pending question earns nothing", !(await badges(a.uid)).includes("author"));
  await call(`/rest/v1/questions?id=eq.${q.id}`, { method: "PATCH", body: { review_status: "approved", reviewed_by: teacher.uid, reviewed_at: new Date().toISOString() } });
  check("an approved question earns Author", (await badges(a.uid)).includes("author"));

  // ---- Staff never earn badges ----
  const tb = await rpc("award_badges", { p_user: teacher.uid, p_event: "answers", p_context: { domains: [1] } });
  check("staff earn no badges", Array.isArray(tb.data) && tb.data.length === 0 && (await badges(teacher.uid)).length === 0);

  // ---- Privacy and writes ----
  let r = await call(`/rest/v1/user_badges?select=badge_code&user_id=eq.${m.uid}`, { token: v.token });
  check("a classmate sees badges when shown (default)", r.data?.length >= 2, `rows=${r.data?.length}`);
  await call(`/rest/v1/profiles?id=eq.${m.uid}`, { method: "PATCH", token: m.token, body: { show_badges: false } });
  r = await call(`/rest/v1/user_badges?select=badge_code&user_id=eq.${m.uid}`, { token: v.token });
  check("hiding badges hides them from classmates", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);
  r = await call(`/rest/v1/user_badges?select=badge_code&user_id=eq.${m.uid}`, { token: teacher.token });
  check("teachers still see hidden badges", r.data?.length >= 2, `rows=${r.data?.length}`);
  r = await call(`/rest/v1/user_badges?select=badge_code&user_id=eq.${m.uid}`, { token: m.token });
  check("the student still sees their own", r.data?.length >= 2);
  r = await call("/rest/v1/user_badges", { method: "POST", token: v.token, body: { user_id: v.uid, badge_code: "trophy-summit" } });
  check("a student cannot grant themselves a badge", r.status >= 400, `status=${r.status}`);
  r = await rpc("award_badges", { p_user: v.uid, p_event: "promotion", p_context: {} }, v.token);
  check("a student cannot call the award engine", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/user_badges?select=badge_code,seen_at&user_id=eq.${v.uid}`, { token: v.token });
  check("new badges start unseen", r.data.every((b) => b.seen_at === null));
  r = await rpc("mark_badges_seen", { p_codes: ["first-steps"] }, v.token);
  const seen = (await call(`/rest/v1/user_badges?select=badge_code,seen_at&user_id=eq.${v.uid}`)).data;
  check("mark_badges_seen marks only the named badge", r.data === 1 && seen.find((b) => b.badge_code === "first-steps").seen_at && !seen.find((b) => b.badge_code === "century").seen_at);
  r = await rpc("mark_badges_seen", { p_codes: ["domain-np"] }, v.token);
  const mSeen = (await call(`/rest/v1/user_badges?select=seen_at&user_id=eq.${m.uid}&badge_code=eq.domain-np`)).data[0];
  check("a student cannot mark someone else's badges seen", r.data === 0 && mSeen.seen_at === null);

  // ---- Backfill is idempotent ----
  r = await rpc("backfill_badges", { p_user: mk.uid });
  check("backfill adds nothing already earned", r.data === 0, r.data);
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  for (const path of cleanup.reverse()) await call(path, { method: "DELETE" });
  for (const u of users) await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
  if (users.length) {
    const left = (await call(`/rest/v1/user_badges?select=user_id&user_id=in.(${users.map((u) => u.uid).join(",")})`)).data ?? [];
    check("cleanup: test users' badges removed", left.length === 0, `rows=${left.length}`);
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`); if (failed) process.exitCode = 1;
}
