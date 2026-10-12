// Ranking v2, phase 2 gate — rules engine, shadow mode, mocks and the promotion quiz, against STAGING only.
// T34 style: throwaway users, PASS/FAIL per assertion, users deleted at the end. Secrets from .env.local.
// One block flips ranking_config.rules_live to 1 for a few seconds to test the live path, and always restores it to 0.
//
//   node scripts/test-ranking-phase2.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL_STAGING, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING, SR = env.SUPABASE_SERVICE_ROLE_KEY_STAGING;
if (!SB?.includes("kwhaqhhwqykckarjbdod")) throw new Error("refusing: not the staging project");

const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail !== "" ? ` | ${detail}` : ""}`); };
async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: token ? ANON : SR, Authorization: `Bearer ${token ?? SR}` };
  if (method !== "GET") { headers["Content-Type"] = "application/json"; headers.Prefer = prefer ?? "return=representation"; }
  const res = await fetch(`${SB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* 204 */ }
  return { status: res.status, data };
}
const rpc = (fn, args = {}, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, token });
const users = [];
async function createUser(role = "student") {
  const email = `rank2-${role}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  await call(`/rest/v1/profiles?id=eq.${u.data.id}`, { method: "PATCH", body: { role, full_name: `${role} (ranking phase 2 test)` } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  const user = { uid: u.data.id, token: t.data.access_token }; users.push(user); return user;
}
const shadow = async (uid, kind) => (await call(`/rest/v1/xp_shadow?select=old_amount,new_amount,detail,created_at&user_id=eq.${uid}&kind=eq.${kind}&order=created_at.asc`)).data ?? [];
const sum = (a) => a.reduce((s, x) => s + x, 0);

let liveFlipped = false;
try {
  // ---- Worked examples (pure functions) ----
  const w = [...Array(15).fill(1.5), ...Array(5).fill(1.0), ...Array(5).fill(0.125)];
  let r = await rpc("practice_xp_v2", { p_answered: 25, p_weights: w });
  // The plan says 1.15 -> 115, but (15 x 1.5 + 5 x 1.0 + 5 x 0.125) / 25 = 28.125 / 25 = 1.125 -> 112.5, rounded down = 112.
  check("worked example: 15 new/weak + 5 developing + 5 mastered repeats = 112 XP (plan's 115 is an arithmetic slip)", r.data === 112, r.data);
  r = await rpc("practice_xp_v2", { p_answered: 25, p_weights: Array(25).fill(0.125) });
  check("worked example: 25 mastered repeats = 12 XP", r.data === 12, r.data);
  const streak = [];
  for (const n of [1, 7, 8, 30]) streak.push((await rpc("streak_bonus", { p_length: n })).data);
  check("streak bonus: day 1 = 10, day 7 = 70, day 8 = 70, day 30 = 70", JSON.stringify(streak) === "[10,70,70,70]", JSON.stringify(streak));
  let total = 0; for (let n = 1; n <= 100; n++) total += Math.min(10 * n, 70);
  const d7 = (await rpc("streak_bonus", { p_length: 7 })).data, d100 = (await rpc("streak_bonus", { p_length: 100 })).data;
  check("a 100-day streak pays 6,790 XP in total", total === 6790 && d7 === 70 && d100 === 70, total);

  const cfg = (await call("/rest/v1/ranking_config?select=value&key=eq.rules_live")).data[0].value;
  check("staging is in shadow mode (rules_live = 0)", Number(cfg) === 0, cfg);

  const np = (await call("/rest/v1/questions?select=id,domain_id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&domain_id=eq.1&order=id&limit=30")).data;
  const right = (q) => q.question_options.filter((o) => o.is_correct).map((o) => o.id);
  const wrong = (q) => [q.question_options.find((o) => !o.is_correct).id];
  const session = (u, qs, pick) => rpc("record_practice_answers", { p_answers: qs.map((q) => ({ question_id: q.id, option_ids: pick(q) })) }, u.token);

  // ---- Shadow mode: old paid, new logged ----
  const s = await createUser();
  r = await session(s, np.slice(0, 10), right);
  let xp = (await call(`/rest/v1/xp_events?select=amount&source_id=eq.${r.data.id}`)).data;
  let sh = await shadow(s.uid, "practice");
  check("shadow: the old 40 XP band is still what is paid", xp[0]?.amount === 40, xp[0]?.amount);
  check("shadow: new rules logged 60 (10 questions, New topic x1.5)", sh[0]?.old_amount === 40 && sh[0]?.new_amount === 60, `${sh[0]?.old_amount}/${sh[0]?.new_amount}`);

  // ---- Farming: re-answering the same questions in a now-Mastered topic ----
  r = await session(s, np.slice(0, 10), right);
  sh = await shadow(s.uid, "practice");
  check("repeats in a mastered topic: 0.5 x 0.25 = 0.125 -> 5 of 40", sh[1]?.new_amount === 5, `${sh[1]?.new_amount} (states ${JSON.stringify(sh[1]?.detail?.states)}, repeats ${sh[1]?.detail?.repeats})`);
  // ---- Farming: new questions in a mastered topic ----
  r = await session(s, np.slice(10, 20), right);
  sh = await shadow(s.uid, "practice");
  check("new questions in a mastered topic pay x0.5 -> 20 of 40", sh[2]?.new_amount === 20, sh[2]?.new_amount);

  // ---- Students can't see the breakdown ----
  r = await call(`/rest/v1/question_attempts?select=xp_weight&user_id=eq.${s.uid}`, { token: s.token });
  check("student cannot read answer weights", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/xp_events?select=detail&user_id=eq.${s.uid}`, { token: s.token });
  check("student cannot read award breakdowns", r.status >= 400, `status=${r.status}`);
  r = await call(`/rest/v1/xp_shadow?select=id&user_id=eq.${s.uid}`, { token: s.token });
  check("student cannot read the shadow log", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);
  r = await rpc("topic_state", { p_user: s.uid, p_domain: 1 }, s.token);
  check("student cannot call topic_state", r.status >= 400, `status=${r.status}`);
  r = await call("/rest/v1/ranking_config?select=key", { token: s.token });
  check("student cannot read the config", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);
  r = await call("/rest/v1/ranking_config?key=eq.mult_mastered", { method: "PATCH", token: s.token, body: { value: 10 } });
  const mm = (await call("/rest/v1/ranking_config?select=value&key=eq.mult_mastered")).data[0].value;
  check("student cannot change the config", Number(mm) === 0.5, `value=${mm}`);
  r = await call(`/rest/v1/question_attempts?select=id,is_correct&user_id=eq.${s.uid}&limit=1`, { token: s.token });
  check("student still reads their own attempts (allowed columns)", r.status === 200 && r.data.length === 1, `status=${r.status}`);

  // ---- Weak -> Mastered milestone, once ----
  const m = await createUser();
  await session(m, np.slice(0, 10), wrong);                 // 10 wrong: Weak (mark set)
  for (let i = 0; i < 3; i++) await session(m, np.slice(10, 20), right); // last 30 all right: Mastered
  let ms = await shadow(m.uid, "topic_mastered");
  check("Weak -> Mastered logs the 200 XP milestone", ms.length === 1 && ms[0].new_amount === 200, JSON.stringify(ms.map((x) => x.new_amount)));
  await session(m, np.slice(20, 30), wrong); await session(m, np.slice(20, 30), right);
  ms = await shadow(m.uid, "topic_mastered");
  check("the milestone cannot be earned twice", ms.length === 1, `rows=${ms.length}`);
  const marks = (await call(`/rest/v1/topic_weak_marks?select=domain_id&user_id=eq.${m.uid}`)).data;
  check("the weak mark was recorded", marks.length === 1 && marks[0].domain_id === 1, JSON.stringify(marks));

  // ---- Daily cap 300 ----
  const c = await createUser();
  const all = (await call("/rest/v1/questions?select=id,question_options(id,is_correct)&is_active=eq.true&context=eq.standalone&order=id&limit=100")).data;
  for (let i = 0; i < 4; i++) await session(c, all.slice(i * 25, i * 25 + 25), right);
  sh = await shadow(c.uid, "practice");
  check("practice XP stops at the 300 daily cap", sum(sh.map((x) => x.new_amount)) === 300 && sh[sh.length - 1].new_amount === 0, JSON.stringify(sh.map((x) => x.new_amount)));
  // Many tiny sessions earn the small band only, and are capped the same way.
  const t = await createUser();
  for (let i = 0; i < 3; i++) await session(t, all.slice(i, i + 1), right);
  sh = await shadow(t.uid, "practice");
  check("one-question sessions earn the 10 XP band (x1.5 = 15) each", sh.every((x) => x.old_amount === 10 && x.new_amount === 15), JSON.stringify(sh.map((x) => x.new_amount)));
  const tStreak = await shadow(t.uid, "streak_day");
  check("3 questions in a day is no streak day", tStreak.length === 0, `rows=${tStreak.length}`);

  // ---- Streak in Trinidad days ----
  const k = await createUser();
  const backfill = [];
  for (let day = 6; day >= 1; day--) for (let i = 0; i < 10; i++) {
    // Trinidad is UTC-4 all year: shift to its wall clock, step back whole days, then pin 18:00 UTC (2 pm Trinidad).
    const when = new Date(Date.now() - 4 * 3600000 - day * 86400000); when.setUTCHours(18, 0, 0, 0);
    backfill.push({ user_id: k.uid, question_id: all[40 + i].id, option_ids: right(all[40 + i]), domain_id: null, is_correct: true, source: "practice", answered_at: when.toISOString() });
  }
  await call("/rest/v1/question_attempts", { method: "POST", body: backfill, prefer: "return=minimal" });
  await session(k, all.slice(60, 70), right);
  const ks = await shadow(k.uid, "streak_day");
  check("7th day in a row logs a 70 XP streak bonus", ks.length === 1 && ks[0].new_amount === 70 && ks[0].detail.streak === 7, JSON.stringify(ks.map((x) => [x.new_amount, x.detail.streak])));
  await session(k, all.slice(70, 80), right);
  check("the streak bonus is paid once per day", (await shadow(k.uid, "streak_day")).length === 1);
  r = await rpc("study_streak_v2", { p_user: k.uid }, k.token);
  check("study_streak_v2 shows 7", r.data === 7, r.data);
  r = await rpc("study_streak_v2", { p_user: k.uid }, t.token);
  check("another student cannot read someone's streak", r.status >= 400, `status=${r.status}`);

  // ---- Mock exams: attempts recorded, retakes pay less ----
  const teacher = await createUser("teacher");
  const mk = await createUser();
  const set = (await call("/rest/v1/mock_exam_sets", { method: "POST", body: { title: "Ranking test set", created_by: teacher.uid, is_active: true } })).data[0];
  await call("/rest/v1/mock_exam_set_questions", { method: "POST", prefer: "return=minimal", body: all.slice(80, 90).map((q, i) => ({ set_id: set.id, question_id: q.id, display_order: i + 1 })) });
  for (let run = 0; run < 2; run++) {
    const sess = (await call("/rest/v1/mock_exam_sessions", { method: "POST", body: { student_id: mk.uid, set_id: set.id } })).data[0];
    await call("/rest/v1/mock_exam_responses", { method: "POST", prefer: "return=minimal", body: all.slice(80, 90).map((q) => ({ session_id: sess.id, question_id: q.id, selected_option_ids: right(q) })) });
    await rpc("complete_mock_exam_session", { p_session_id: sess.id }, mk.token);
  }
  const mo = await shadow(mk.uid, "mock");
  check("a first mock pays its full award in the new rules (400)", mo[0]?.new_amount === 400 && mo[0]?.old_amount === 400, `${mo[0]?.old_amount}/${mo[0]?.new_amount}`);
  check("retaking the same set within 14 days pays less (400 x 0.25 = 100)", mo[1]?.new_amount === 100 && mo[1]?.detail?.retake === true, `${mo[1]?.new_amount}`);
  r = await call(`/rest/v1/question_attempts?select=id&user_id=eq.${mk.uid}&source=eq.mock`);
  check("mock answers are recorded as attempts", r.data.length === 20, `rows=${r.data.length}`);

  // ---- Live path (rules_live = 1 for a few seconds) ----
  await call("/rest/v1/ranking_config?key=eq.rules_live", { method: "PATCH", body: { value: 1 } }); liveFlipped = true;
  const lv = await createUser();
  r = await session(lv, np.slice(0, 10), right);
  xp = (await call(`/rest/v1/xp_events?select=amount,detail&source_id=eq.${r.data.id}`)).data;
  check("live: practice pays the weighted amount (60) with its breakdown", xp[0]?.amount === 60 && xp[0]?.detail?.raw === 60, `${xp[0]?.amount}`);
  const lvStreak = (await call(`/rest/v1/xp_events?select=amount&user_id=eq.${lv.uid}&reason=eq.streak_day`)).data;
  check("live: the streak day pays 10 XP on day 1", lvStreak.length === 1 && lvStreak[0].amount === 10, JSON.stringify(lvStreak));
  await call("/rest/v1/ranking_config?key=eq.rules_live", { method: "PATCH", body: { value: 0 } }); liveFlipped = false;

  // ---- Promotion quiz ----
  const p = await createUser();
  r = await rpc("start_promotion_quiz", {}, p.token);
  check("no quiz before reaching the next level's XP", r.status >= 400, r.data?.message);
  await call("/rest/v1/xp_events", { method: "POST", prefer: "return=minimal", body: { user_id: p.uid, amount: 250, reason: "question_approved", source_id: crypto.randomUUID() } });
  let st = (await rpc("promotion_status", {}, p.token)).data;
  check("250 XP: eligible for level 1, rank still 0", st.eligible === true && st.rank_level === 0 && st.next_level === 1, JSON.stringify({ e: st.eligible, r: st.rank_level }));
  const attId = (await rpc("start_promotion_quiz", {}, p.token)).data;
  const pqs = (await call(`/rest/v1/promotion_questions?select=question_id,questions(domain_id)&attempt_id=eq.${attId}`)).data;
  const byDomain = {}; for (const x of pqs) byDomain[x.questions.domain_id] = (byDomain[x.questions.domain_id] ?? 0) + 1;
  check("25 questions in blueprint proportions (NP8 CDM5 NLM4 PC3 HPMW2 COM2 PD1)", pqs.length === 25 && JSON.stringify(byDomain) === JSON.stringify({ 1: 8, 2: 5, 3: 4, 4: 3, 5: 2, 6: 2, 7: 1 }), JSON.stringify(byDomain));
  r = await call(`/rest/v1/promotion_questions?select=question_id&attempt_id=eq.${attId}`, { token: p.token });
  check("student cannot list the quiz's questions in advance", r.status === 200 && r.data.length === 0, `rows=${r.data?.length}`);
  let cur = (await rpc("promotion_current", { p_attempt: attId }, p.token)).data;
  check("current question has stem and options but no key", cur.position === 1 && cur.question.options.length >= 2 && !JSON.stringify(cur).includes("is_correct") && cur.seconds_left >= 85, `secs=${cur.seconds_left}`);
  r = await rpc("promotion_answer", { p_attempt: attId, p_position: 2, p_option_ids: [cur.question.options[0].id] }, p.token);
  check("cannot answer ahead of the current question", r.status >= 400, r.data?.message);
  const other = await createUser();
  r = await rpc("promotion_current", { p_attempt: attId }, other.token);
  check("another student cannot open this quiz", r.status >= 400, `status=${r.status}`);
  const key = async (qid) => (await call(`/rest/v1/question_options?select=id&is_correct=eq.true&question_id=eq.${qid}`)).data.map((o) => o.id);
  // Timer tampering: question 1 was served 100 s ago.
  await call(`/rest/v1/promotion_questions?attempt_id=eq.${attId}&position=eq.1`, { method: "PATCH", body: { served_at: new Date(Date.now() - 100000).toISOString() } });
  r = await rpc("promotion_answer", { p_attempt: attId, p_position: 1, p_option_ids: await key(cur.question.id) }, p.token);
  check("an answer after 90 s (+ grace) is not accepted and scores wrong", r.data?.timed_out === true && r.data?.position === 2, JSON.stringify({ t: r.data?.timed_out, pos: r.data?.position }));
  cur = r.data;
  r = await rpc("promotion_answer", { p_attempt: attId, p_position: 1, p_option_ids: await key(pqs[0].question_id) }, p.token);
  check("no going back to an earlier question", r.data?.position === 2 && r.data?.timed_out === true, `pos=${r.data?.position}`);
  while (!cur.done) cur = (await rpc("promotion_answer", { p_attempt: attId, p_position: cur.position, p_option_ids: await key(cur.question.id) }, p.token)).data;
  check("24 of 25 passes (pass mark 17)", cur.done && cur.score === 24 && cur.passed === true, JSON.stringify({ s: cur.score, p: cur.passed }));
  st = (await rpc("promotion_status", {}, p.token)).data;
  check("after passing, rank is level 1 and the next quiz needs 500 XP", st.rank_level === 1 && st.eligible === false && st.next_level_min_xp === 500, JSON.stringify({ r: st.rank_level, e: st.eligible }));
  r = await call(`/rest/v1/question_attempts?select=id&user_id=eq.${p.uid}&source=eq.promotion`);
  const pxp = (await call(`/rest/v1/xp_events?select=reason&user_id=eq.${p.uid}`)).data;
  check("quiz answers count as attempts but pay no practice XP", r.data.length === 25 && !pxp.some((x) => x.reason === "practice_session"), `attempts=${r.data.length}`);

  // Fail, then the 24-hour wait.
  const f = await createUser();
  await call("/rest/v1/xp_events", { method: "POST", prefer: "return=minimal", body: { user_id: f.uid, amount: 250, reason: "question_approved", source_id: crypto.randomUUID() } });
  const fAtt = (await rpc("start_promotion_quiz", {}, f.token)).data;
  cur = (await rpc("promotion_current", { p_attempt: fAtt }, f.token)).data;
  while (!cur.done) {
    const k2 = await key(cur.question.id);
    const pick = cur.question.options.map((o) => o.id).find((id) => !k2.includes(id));
    cur = (await rpc("promotion_answer", { p_attempt: fAtt, p_position: cur.position, p_option_ids: [pick] }, f.token)).data;
  }
  check("0 of 25 fails", cur.done && cur.passed === false && cur.score === 0, JSON.stringify({ s: cur.score }));
  r = await rpc("start_promotion_quiz", {}, f.token);
  st = (await rpc("promotion_status", {}, f.token)).data;
  check("a failed quiz can be retaken only after 24 hours", r.status >= 400 && st.retake_available_at && st.rank_level === 0, r.data?.message);
} catch (e) {
  console.error("test error:", e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  if (liveFlipped) await call("/rest/v1/ranking_config?key=eq.rules_live", { method: "PATCH", body: { value: 0 } });
  const live = (await call("/rest/v1/ranking_config?select=value&key=eq.rules_live")).data?.[0]?.value;
  check("rules_live restored to 0", Number(live) === 0, live);
  await call(`/rest/v1/mock_exam_sets?title=eq.Ranking%20test%20set`, { method: "DELETE" });
  for (const u of users) await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
  if (users.length) {
    const ids = users.map((u) => u.uid).join(",");
    const left = [
      ...((await call(`/rest/v1/question_attempts?select=id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/xp_events?select=id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/xp_shadow?select=id&user_id=in.(${ids})`)).data ?? []),
      ...((await call(`/rest/v1/promotion_attempts?select=id&user_id=in.(${ids})`)).data ?? []),
    ];
    check("cleanup: test users' data removed", left.length === 0, `rows=${left.length}`);
  }
  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
