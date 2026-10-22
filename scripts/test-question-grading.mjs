// Student question grading (20261022180000), against STAGING only: evaluation visibility, the agent CLI round trip
// (pull → finish, malformed grades requeued), leaderboard points and visibility, and the 24-hour rule. Changes
// qgen_config for the run and restores it; throwaway users and their questions are deleted in `finally`.
//   node scripts/test-question-grading.mjs
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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
const rpc = (fn, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", token, body: {} });
const cli = (...a) => execFileSync("npx", ["tsx", "scripts/grade-questions.ts", ...a], { encoding: "utf8" });
const setCfg = (key, value) => call(`/rest/v1/qgen_config?key=eq.${key}`, { method: "PATCH", body: { value } });

const users = [], questions = [];
async function createUser(role, tag) {
  const email = `qgrade-${tag}-${randomBytes(4).toString("hex")}@e2e-test.example.com`, password = randomBytes(12).toString("base64url") + "a1";
  const u = await call("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  if (!u.data?.id) throw new Error(`create ${tag}: ${u.status}`);
  const x = { uid: u.data.id }; users.push(x);
  await call(`/rest/v1/profiles?id=eq.${x.uid}`, { method: "PATCH", body: { role, subscription_tier: "premium", show_badges: true, full_name: `Grade ${tag} Tester` } });
  const t = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: ANON });
  x.token = t.data.access_token; return x;
}
/** What submitQuestion does: an assignment, the student's question + options, then a queued evaluation. */
async function submit(student, stem) {
  const a = (await call("/rest/v1/qgen_assignments?select=id", { method: "POST", body: { user_id: student.uid, method: "bank", domain_id: 1, topic: "Heart failure", taxonomy: "AP", stem_length: "short" } })).data[0];
  const q = (await call("/rest/v1/questions?select=id", { method: "POST", token: student.token, body: { body: stem, domain_id: 1, question_type: "mcq", source: "student-submission", is_ai_generated: false, is_active: false, review_status: "pending", created_by: student.uid } })).data[0];
  questions.push(q.id);
  await call("/rest/v1/question_options", { method: "POST", token: student.token, body: ["Give furosemide", "Weigh daily", "Encourage fluids", "Lie flat"].map((b, i) => ({ question_id: q.id, body: b, is_correct: i === 1, display_order: i + 1 })) });
  await call(`/rest/v1/qgen_assignments?id=eq.${a.id}`, { method: "PATCH", body: { question_id: q.id, used_at: new Date().toISOString() } });
  const assignment = { method: "bank", topic: "Heart failure", domainCode: "NP", domainName: "Nursing Practice", taxonomy: "AP", stemLength: "short",
    question: { stem, options: [{ letter: "A", text: "Give furosemide" }, { letter: "B", text: "Weigh daily" }, { letter: "C", text: "Encourage fluids" }, { letter: "D", text: "Lie flat" }], correct: "B", rationale: "Daily weights detect fluid retention early." } };
  const e = (await call("/rest/v1/question_evaluations?select=id", { method: "POST", body: { question_id: q.id, user_id: student.uid, pathway: "agent", status: "queued", assignment } })).data[0];
  return { q: q.id, e: e.id };
}
const grade = (o) => ({
  key_check: { student_key_is_correct: true, single_best_answer: true, note: "B is the best answer." },
  stem: { score: o.stem, strengths: "Clear client.", improve: "" }, options: { score: o.options, strengths: "Plausible.", improve: "" },
  alignment: { score: o.alignment, domain_match: true, taxonomy_match: true, stem_length_match: true, feedback: "Fits." },
  rationale: { provided: true, bonus: o.bonus, feedback: "Good." }, summary: "Nice work.", next_steps: [],
});

const cfgBefore = Object.fromEntries(((await call("/rest/v1/qgen_config?select=key,value")).data ?? []).map((r) => [r.key, r.value]));
if (!cfgBefore.grading_mode) throw new Error("apply 20261022180000 first");
const queuedBefore = ((await call("/rest/v1/question_evaluations?select=id&status=eq.queued")).data ?? []).length;
if (queuedBefore > 0) throw new Error(`${queuedBefore} evaluations already queued on staging; the CLI test would pull them. Run it when the queue is empty.`);
try {
  const s1 = await createUser("student", "s1"), s2 = await createUser("student", "s2"), t = await createUser("teacher", "t");

  // ---- visibility ----
  const a = await submit(s1, "A client with heart failure gained 2 kg overnight. Which assessment should the nurse do first?");
  const b = await submit(s1, "A client on furosemide reports leg cramps. Which electrolyte should the nurse check first?");
  let r = await call(`/rest/v1/question_evaluations?select=id,status&question_id=eq.${a.q}`, { token: s1.token });
  check("student reads own evaluation", r.data?.length === 1 && r.data[0].status === "queued", JSON.stringify(r.data));
  r = await call(`/rest/v1/question_evaluations?select=id&question_id=eq.${a.q}`, { token: s2.token });
  check("another student cannot", r.data?.length === 0, JSON.stringify(r.data));
  r = await call(`/rest/v1/question_evaluations?select=id&question_id=eq.${a.q}`, { token: t.token });
  check("teacher can", r.data?.length === 1);
  r = await call(`/rest/v1/question_evaluations?id=eq.${a.e}`, { method: "PATCH", token: s1.token, body: { overall: 100, passed: true } });
  check("student cannot change a grade", r.status === 401 || r.status === 403, `${r.status}`);
  r = await call("/rest/v1/qgen_assignments?select=id", { method: "POST", token: s1.token, body: { user_id: s1.uid, method: "bank", domain_id: 1, topic: "x", taxonomy: "AP", stem_length: "short" } });
  check("student cannot create their own assignment", r.status === 401 || r.status === 403, `${r.status}`);
  r = await call(`/rest/v1/qgen_assignments?select=id&user_id=eq.${s1.uid}`, { token: s2.token });
  check("assignments are private", r.data?.length === 0);

  // ---- agent CLI round trip ----
  const dir = mkdtempSync(join(tmpdir(), "qgrade-"));
  let out = cli("pull", "--limit", "5", "--out", join(dir, "bundle.json"));
  const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8"));
  check("pull: both queued items in the bundle, with instructions", bundle.items.length === 2 && bundle.instructions.includes("Score each bar") && bundle.items[0].prompt.includes("ASSIGNMENT"), out.trim());
  r = await call(`/rest/v1/question_evaluations?select=status&id=in.(${a.e},${b.e})`);
  check("pull marks them running", r.data.every((x) => x.status === "running"));
  writeFileSync(join(dir, "results.json"), JSON.stringify([
    { evaluation_id: a.e, grade: grade({ stem: 29, options: 44, alignment: 24, bonus: 5 }) },
    { evaluation_id: b.e, grade: { stem: { score: "lots" } } },
  ]));
  out = cli("finish", join(dir, "results.json"));
  r = await call(`/rest/v1/question_evaluations?select=status,overall,passed,result&id=eq.${a.e}`);
  check("finish: valid grade stored, totals computed in code (29+44+24+5 → capped bars, 102)", r.data[0].status === "done" && r.data[0].overall === 102 && r.data[0].passed === true, JSON.stringify({ o: r.data[0].overall, p: r.data[0].passed }));
  r = await call(`/rest/v1/question_evaluations?select=status,error&id=eq.${b.e}`);
  check("finish: malformed grade goes back to the queue", r.data[0].status === "queued" && /malformed/.test(r.data[0].error ?? ""), JSON.stringify(r.data[0]));
  // A wrong key never passes, whatever the scores.
  cli("pull", "--limit", "5", "--out", join(dir, "bundle2.json"));
  const wrong = grade({ stem: 30, options: 45, alignment: 25, bonus: 5 }); wrong.key_check.student_key_is_correct = false;
  writeFileSync(join(dir, "results2.json"), JSON.stringify([{ evaluation_id: b.e, grade: wrong }]));
  cli("finish", join(dir, "results2.json"));
  r = await call(`/rest/v1/question_evaluations?select=overall,passed&id=eq.${b.e}`);
  check("a wrong answer key fails even at full marks", r.data[0].overall === 105 && r.data[0].passed === false, JSON.stringify(r.data[0]));

  // ---- leaderboard ----
  await call(`/rest/v1/questions?id=eq.${a.q}`, { method: "PATCH", body: { review_status: "approved", reviewed_by: t.uid, reviewed_at: new Date().toISOString() } });
  await setCfg("leaderboard", "off");
  r = await rpc("qgen_leaderboard", s1.token);
  check("leaderboard off: empty for students", r.status === 200 && r.data.length === 0);
  await setCfg("leaderboard", "staff");
  r = await rpc("qgen_leaderboard", s1.token);
  const rt = await rpc("qgen_leaderboard", t.token);
  check("leaderboard 'staff': teacher sees it, student doesn't", r.data.length === 0 && rt.data.some((x) => x.user_id === s1.uid));
  await setCfg("leaderboard", "students");
  r = await rpc("qgen_leaderboard", s2.token);
  const row = r.data.find((x) => x.user_id === s1.uid);
  check("leaderboard 'students': 15 (score 90+) + 5 (rationale) = 20 points, name shortened", row?.points === 20 && row.approved === 1 && row.display_name === "Grade s.", JSON.stringify(row));
  await call(`/rest/v1/profiles?id=eq.${s1.uid}`, { method: "PATCH", body: { show_badges: false } });
  r = await rpc("qgen_leaderboard", s2.token);
  check("a student who hides their badges shows as 'A student'", r.data.find((x) => x.user_id === s1.uid)?.display_name === "A student");
  r = await rpc("qgen_leaderboard", ANON);
  check("anon cannot read the leaderboard", r.status === 401 || r.status === 403, `${r.status}`);

  // ---- 24-hour rule ----
  await setCfg("daily_rule", "off");
  await call(`/rest/v1/profiles?id=eq.${s2.uid}`, { method: "PATCH", body: { created_at: new Date(Date.now() - 3 * 86400000).toISOString() } });
  r = await rpc("qgen_daily_status", s2.token);
  check("rule off: nobody is due", r.data?.due === false && r.data.rule_on === false, JSON.stringify(r.data));
  await setCfg("daily_rule", "on");
  r = await rpc("qgen_daily_status", s2.token);
  check("rule on: a 3-day-old student with no question is due", r.data?.due === true, JSON.stringify(r.data));
  r = await rpc("qgen_daily_status", s1.token);
  check("rule on: a student in their first day is not due", r.data?.due === false);
  await call(`/rest/v1/profiles?id=eq.${s1.uid}`, { method: "PATCH", body: { created_at: new Date(Date.now() - 3 * 86400000).toISOString() } });
  r = await rpc("qgen_daily_status", s1.token);
  check("rule on: a student who wrote one today is not due", r.data?.due === false, JSON.stringify(r.data));
  r = await rpc("qgen_daily_status", t.token);
  check("rule on: staff are never due", r.data?.due === false);
} catch (e) { console.error("test error:", e.stack); process.exitCode = 1; }
finally {
  for (const [k, v] of Object.entries(cfgBefore)) await setCfg(k, v);
  for (const q of questions) { await call(`/rest/v1/question_options?question_id=eq.${q}`, { method: "DELETE" }); await call(`/rest/v1/questions?id=eq.${q}`, { method: "DELETE" }); }
  for (const u of users) {
    const d = await call(`/auth/v1/admin/users/${u.uid}`, { method: "DELETE" });
    if (d.status >= 300) console.error(`CLEANUP WARNING: user ${u.uid} not deleted (status ${d.status}) ${JSON.stringify(d.data).slice(0, 100)}`);
  }
  const after = Object.fromEntries(((await call("/rest/v1/qgen_config?select=key,value")).data ?? []).map((r) => [r.key, r.value]));
  const left = users.length ? (await call(`/rest/v1/profiles?select=id&id=in.(${users.map((u) => u.uid).join(",")})`)).data ?? [] : [];
  console.log(`\nconfig restored: ${JSON.stringify(after) === JSON.stringify(cfgBefore) ? "yes" : "NO " + JSON.stringify(after)}`);
  console.log(left.length ? `CLEANUP WARNING: ${left.length} test profiles left` : "cleanup: throwaway users and questions deleted");
  const failed = results.filter((x) => !x).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed || left.length) process.exitCode = 1;
}
